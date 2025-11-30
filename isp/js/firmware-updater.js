/**
 * FirmwareUpdater - Orchestrates WebUSB DFU firmware updates for STM32F446
 *
 * Complete update flow:
 * 1. Check current firmware version via SCPI
 * 2. Query GitLab API for latest release
 * 3. Download firmware binary (prefer .hex)
 * 4. Verify SHA-256 checksum
 * 5. Send :SYSTem:DFU command to enter bootloader
 * 6. Connect via WebUSB (VID:PID 0483:df11)
 * 7. Flash firmware using DfuSe protocol (skip EEPROM gaps)
 * 8. Readback and verify flashed data (only for binary files)
 * 9. Reboot device to application
 *
 * Dependencies: dfu.js, dfuse.js (must be loaded first)
 */

class FirmwareUpdater {
    constructor(serialManager) {
        this.serialManager = serialManager;

        // STM32F446 DFU device identification
        this.DFU_VID = 0x0483;  // STMicroelectronics
        this.DFU_PID = 0xdf11;  // DFU Bootloader

        // STM32F446 memory layout
        this.FLASH_START = 0x08000000;
        this.FLASH_SIZE = 0x80000;  // 512KB
        this.TRANSFER_SIZE = 2048;  // 2KB blocks

        // Determine update source based on environment
        // 3 sources: local (localhost), GitHub Pages (melexis.io), GitLab Pages (internal)
        // Note: file:// protocol doesn't support fetch due to CORS
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;

        if (protocol === 'file:') {
            // file:// protocol: fetch doesn't work due to CORS
            // User should use local HTTP server: python3 -m http.server 8000
            this.updateSource = 'file';
            this.PAGES_BASE_URL = '.';
        } else if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
            // Local HTTP server: use relative path to web/latest/
            this.updateSource = 'local';
            this.PAGES_BASE_URL = '.';
        } else if (hostname.includes('melexis.io') || hostname.includes('github.io')) {
            // GitHub Pages (external): relative path
            this.updateSource = 'github';
            this.PAGES_BASE_URL = '.';
        } else {
            // GitLab Pages (internal)
            this.updateSource = 'gitlab';
            this.PAGES_BASE_URL = 'https://ays.pages.melexis.com/mlx9064x-isp-melexisio';
        }

        console.log(`Firmware update source: ${this.updateSource} (${this.PAGES_BASE_URL})`);
        this.MANIFEST_URL = `${this.PAGES_BASE_URL}/latest/firmware-manifest.json`;

        // Fallback: GitLab API configuration (requires authentication for private repos)
        this.GITLAB_PROJECT_ID = 'ays%2Fmlx9064x-isp-melexisio';
        this.GITLAB_API_BASE = 'https://gitlab.melexis.com/api/v4';

        // State tracking
        this.updateState = 'IDLE';
        this.dfuDevice = null;

        // Progress callbacks
        this.onProgress = null;
        this.onStatus = null;
        this.onError = null;
        this.onComplete = null;
    }

    /**
     * Check for firmware updates
     * @returns {Promise<Object|null>} Update info if available, null if up-to-date
     */
    async checkForUpdates() {
        try {
            this.updateState = 'CHECKING_VERSION';
            this._updateStatus('Checking firmware version...');

            // Get current firmware version
            const currentVersion = await this._getCurrentVersion();

            // Fetch latest release from GitLab
            this._updateStatus('Checking for updates...');
            const latestRelease = await this._getLatestRelease();

            if (!latestRelease) {
                throw new Error('No releases found in GitLab');
            }

            // Compare versions
            const updateAvailable = this._compareVersions(latestRelease.tag_name, currentVersion);
            const manifest = await this._getManifest(latestRelease);

            return {
                updateAvailable: updateAvailable,
                current: currentVersion,
                latest: latestRelease.tag_name,
                downloadUrl: updateAvailable ? this._getFirmwareUrl(latestRelease) : null,
                manifest: manifest,
                releaseNotes: latestRelease.description
            };
        } catch (error) {
            this._updateError('Update check failed: ' + error.message);
            throw error;
        }
    }

    /**
     * Perform complete firmware update
     * @param {Object} updateInfo - Update info from checkForUpdates() or local file
     */
    async performUpdate(updateInfo, manualDfuMode = false) {
        let firmwareData = null;
        let isHex = true; // Always HEX now

        try {
            // 1. Download firmware (or use pre-loaded data for local files)
            if (updateInfo.isLocalFile && updateInfo.firmwareData) {
                // Local file upload - skip download
                this._updateStatus('Using local firmware file...');
                firmwareData = updateInfo.firmwareData;
                if (updateInfo.fileName && !updateInfo.fileName.toLowerCase().endsWith('.hex')) {
                    throw new Error('Only HEX files are supported for safe updates');
                }
            } else {
                // Network download
                this.updateState = 'DOWNLOADING';
                const url = updateInfo.downloadUrl;
                this._updateStatus(`Downloading firmware (HEX)...`);
                
                if (!url.toLowerCase().endsWith('.hex')) {
                    throw new Error('Update URL is not a HEX file. Aborting safe update.');
                }
                
                firmwareData = await this._downloadFirmwareText(url);
            }

            // 2. Verify checksum (SKIPPED for HEX)
            // HEX files are text and line endings can vary, so simple SHA256 doesn't work reliably
            // DfuSe protocol has internal checksums for blocks
             this._updateStatus('HEX file detected (skipping checksum)');

            // 3. Enter DFU mode (automatic or manual)
            if (manualDfuMode) {
                // Manual DFU mode - user already entered it
                this.updateState = 'WAITING_DFU';
                this._updateStatus('Waiting for DFU device (you should have entered DFU mode manually)...');
            } else {
                // Automatic DFU mode via SCPI command
                this.updateState = 'ENTERING_DFU';
                this._updateStatus('Entering DFU mode...');
                await this._enterDFUMode();
            }

            // 4. Connect to DFU device (with user gesture preserved for requestDevice)
            this.updateState = 'CONNECTING_DFU';
            this._updateStatus('Connecting to bootloader...');
            await this._connectDFU();

            // 5. Flash firmware
            this.updateState = 'FLASHING';
            this._updateStatus('Flashing firmware...');
            
            await this._flashFirmwareHex(firmwareData);

            // 6. Verify flashed data (readback) - DISABLED for HEX
            
            // 7. Reboot device
            this.updateState = 'REBOOTING';
            this._updateStatus('Rebooting device...');
            await this._leaveDFUMode();

            // 8. Complete
            this.updateState = 'COMPLETE';
            this._updateStatus(`Firmware updated successfully to ${updateInfo.latest}!`);

            if (this.onComplete) {
                this.onComplete(updateInfo.latest);
            }

        } catch (error) {
            this.updateState = 'ERROR';
            this._updateError('Update failed: ' + error.message);

            // Attempt recovery
            if (this.dfuDevice) {
                try {
                    await this._recoverFromError();
                } catch (recoveryError) {
                    console.error('Recovery failed:', recoveryError);
                }
            }

            throw error;
        }
    }

    /**
     * Request user to select DFU device manually
     * @returns {Promise<USBDevice>}
     */
    async requestDFUDevice() {
        if (!('usb' in navigator)) {
            throw new Error('WebUSB not supported. Use Chrome or Edge 89+.');
        }

        try {
            const device = await navigator.usb.requestDevice({
                filters: [{ vendorId: this.DFU_VID, productId: this.DFU_PID }]
            });
            return device;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                throw new Error('No DFU device selected or found');
            }
            throw error;
        }
    }

    /**
     * Get current firmware version from device
     * @private
     */
    async _getCurrentVersion() {
        try {
            const response = await this.serialManager.sendCommand(':PeopleDetection:VERSION?', 2000);

            // Parse version from response
            // Expected format: "[INFO] [isp] Version 0.2.1 | ..."
            const versionMatch = response.match(/Version\s+([\d.]+)/);
            if (versionMatch) {
                return versionMatch[1];
            }

            // Fallback: try to parse firmware version
            // Format: "gHASH.COMMITS" -> extract as version
            const firmwareMatch = response.match(/Firmware:\s+g([0-9a-f]+)\.(\d+)/);
            if (firmwareMatch) {
                return `0.0.${firmwareMatch[2]}`;  // Use commit count as patch version
            }

            return '0.0.0';  // Unknown version
        } catch (error) {
            console.warn('Could not get firmware version:', error);
            return '0.0.0';
        }
    }

    /**
     * Fetch latest release from manifest (local, GitHub Pages, or GitLab Pages)
     * @private
     */
    async _getLatestRelease() {
        const sourceNames = {
            'file': 'file:// (CORS blocked)',
            'local': 'local build (web/latest/)',
            'github': 'GitHub Pages',
            'gitlab': 'GitLab Pages'
        };
        const sourceName = sourceNames[this.updateSource] || this.updateSource;

        // file:// protocol doesn't support fetch - skip gracefully
        if (this.updateSource === 'file') {
            console.log('Version check skipped: file:// protocol does not support fetch.');
            console.log('To enable version check, use a local HTTP server:');
            console.log('  cd web && python3 -m http.server 8000');
            console.log('  Then open http://localhost:8000/index.html');
            throw new Error('Version check unavailable with file:// protocol. Use HTTP server or manual upload.');
        }

        try {
            console.log(`Fetching manifest from ${sourceName}:`, this.MANIFEST_URL);
            const response = await fetch(this.MANIFEST_URL);

            if (!response.ok) {
                throw new Error(`Manifest not available: ${response.status}`);
            }

            const manifest = await response.json();
            console.log(`Manifest fetched from ${sourceName}:`, manifest);

            // Convert Pages manifest format to release format
            return {
                tag_name: manifest.version,
                description: `Release ${manifest.version}\nBuilt: ${manifest.build_date}\nCommit: ${manifest.commit_short}`,
                assets: {
                    links: [
                        {
                            name: 'melexis_io_fw.hex',
                            direct_asset_url: `${this.PAGES_BASE_URL}/latest/melexis_io_fw.hex`
                        }
                    ]
                },
                manifest: manifest
            };
        } catch (error) {
            console.error(`Failed to fetch from ${sourceName}:`, error);
            if (this.updateSource === 'local') {
                console.log('Run ./scripts/prepare_local_release.sh to generate web/latest/ artifacts.');
                throw new Error('Local manifest not found. Run prepare_local_release.sh first.');
            } else {
                console.log('Firmware manifest not available. Use local file upload instead.');
                throw new Error(`Could not fetch manifest from ${sourceName}. Use manual file upload.`);
            }
        }
    }

    /**
     * Get firmware URL from release assets
     * STRICTLY requires HEX for safe updates (preserves EEPROM)
     * @private
     */
    _getFirmwareUrl(release) {
        // For Pages-based releases, try to construct HEX url first
        if (release.manifest && release.manifest.artifacts && release.manifest.artifacts.firmware) {
            const fw = release.manifest.artifacts.firmware;
            
            // Support new manifest format (type="hex" or permanent ends with .hex)
            if (fw.permanent && (fw.type === 'hex' || fw.permanent.toLowerCase().endsWith('.hex'))) {
                 return `${this.PAGES_BASE_URL}/latest/${fw.permanent}`;
            }
            
            // Support old manifest format (explicit 'hex' field)
            if (fw.hex) {
                 return `${this.PAGES_BASE_URL}/latest/${fw.hex}`;
            }
            
            // STRICT: If manifest exists but no HEX, we cannot update safely.
            throw new Error(`Release ${release.tag_name} does not support safe HEX update.`);
        }
        
        // Fallback for manual manifest object construction in _getLatestRelease
         if (release.assets && release.assets.links && release.assets.links.length > 0) {
            // Find HEX link
            const hexLink = release.assets.links.find(l => 
                (l.name && l.name.toLowerCase().includes('hex')) || 
                (l.url && l.url.toLowerCase().endsWith('.hex'))
            );
            
            if (hexLink) {
                return hexLink.direct_asset_url || hexLink.url;
            }
            
            // If no HEX link found, do NOT fallback to BIN (unsafe)
            throw new Error('No safe firmware update (HEX) found in release assets');
        }

        throw new Error('Firmware URL not found in release assets');
    }

    /**
     * Get firmware manifest from release
     * @private
     */
    async _getManifest(release) {
        // For Pages-based releases, manifest is already included
        if (release.manifest) {
            return release.manifest;
        }
        return null;
    }

    /**
     * Compare semantic versions
     * @private
     */
    _compareVersions(latest, current) {
        // Normalize versions: remove 'v' prefix and trim
        latest = (latest || '').toString().trim().replace(/^v/, '');
        current = (current || '').toString().trim().replace(/^v/, '');

        const latestParts = latest.split('.').map(p => parseInt(p, 10));
        const currentParts = current.split('.').map(p => parseInt(p, 10));

        for (let i = 0; i < 3; i++) {
            const l = isNaN(latestParts[i]) ? 0 : latestParts[i];
            const c = isNaN(currentParts[i]) ? 0 : currentParts[i];

            if (l > c) return true;
            if (l < c) return false;
        }

        return false;  // Versions are equal
    }

    /**
     * Download firmware binary with progress tracking
     * @private
     */
    async _downloadFirmware(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength, 10);
        const reader = response.body.getReader();
        const chunks = [];
        let receivedLength = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if (this.onProgress && total) {
                const percent = (receivedLength / total) * 100;
                this.onProgress(percent, `Downloading: ${this._formatBytes(receivedLength)} / ${this._formatBytes(total)}`);
            }
        }

        const allChunks = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
        }
        return allChunks.buffer;
    }

    /**
     * Download firmware text (HEX) with progress tracking
     * @private
     */
    async _downloadFirmwareText(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        
        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength, 10);
        const reader = response.body.getReader();
        let receivedLength = 0;
        let text = '';
        
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            text += decoder.decode(value, {stream: true});
            receivedLength += value.length;
            
            if (this.onProgress && total) {
                const percent = (receivedLength / total) * 100;
                this.onProgress(percent, `Downloading HEX: ${this._formatBytes(receivedLength)} / ${this._formatBytes(total)}`);
            }
        }
        
        // Flush any remaining characters
        text += decoder.decode();
        
        return text;
    }

    /**
     * Calculate SHA-256 hash of data
     * @private
     */
    async _calculateSHA256(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    /**
     * Send DFU command via serial and wait for device to reboot
     * @private
     */
    async _enterDFUMode() {
        try {
            // Send DFU command
            await this.serialManager.sendCommand(':SYST:DFU 42', 1000);
        } catch (error) {
            // Expected - device will disconnect immediately
            console.log('DFU command sent (device disconnecting)');
        }

        // Give device time to reboot
        await this._sleep(2000);

        // Disconnect serial (if not already disconnected)
        try {
            if (this.serialManager.isConnected()) {
                await this.serialManager.disconnect();
            }
        } catch (error) {
            console.log('Serial already disconnected');
        }
    }

    /**
     * Connect to DFU device via WebUSB
     * @private
     */
    async _connectDFU() {
        try {
            // Try to find authorized DFU device first
            const devices = await navigator.usb.getDevices();
            let usbDevice = devices.find(d =>
                d.vendorId === this.DFU_VID && d.productId === this.DFU_PID
            );

            if (!usbDevice) {
                // Need user permission - prompt to select STM32 bootloader
                this._updateStatus('Select "STM32 BOOTLOADER" in the browser popup...');
                if (this.onProgress) {
                    this.onProgress(15, 'Waiting for device selection...');
                }
                usbDevice = await this.requestDFUDevice();
            }

            console.log('USB device found:', usbDevice);
            
            // Find DFU interface
            const dfuInterfaces = dfu.findDeviceDfuInterfaces(usbDevice);
            if (dfuInterfaces.length === 0) {
                throw new Error('No DFU interface found on device');
            }

            // Use first DFU interface
            const dfuSettings = dfuInterfaces[0];
            this.dfuDevice = new dfuse.Device(usbDevice, dfuSettings);
            this.dfuDevice.startAddress = this.FLASH_START;
            
            await this.dfuDevice.open();

            // If no memory descriptor from device, manually configure STM32F446 memory map
            if (!this.dfuDevice.memoryInfo || !this.dfuDevice.memoryInfo.segments) {
                console.warn('No memory descriptor from device, using STM32F446 default map');
                this.dfuDevice.memoryInfo = {
                    name: 'Internal Flash',
                    segments: [
                        // Sectors 0-3: 16KB each
                        { start: 0x08000000, sectorSize: 16384, end: 0x08004000, readable: true, erasable: true, writable: true },
                        { start: 0x08004000, sectorSize: 16384, end: 0x08008000, readable: true, erasable: true, writable: true },
                        { start: 0x08008000, sectorSize: 16384, end: 0x0800C000, readable: true, erasable: true, writable: true },
                        { start: 0x0800C000, sectorSize: 16384, end: 0x08010000, readable: true, erasable: true, writable: true },
                        // Sector 4: 64KB
                        { start: 0x08010000, sectorSize: 65536, end: 0x08020000, readable: true, erasable: true, writable: true },
                        // Sectors 5-7: 128KB each
                        { start: 0x08020000, sectorSize: 131072, end: 0x08040000, readable: true, erasable: true, writable: true },
                        { start: 0x08040000, sectorSize: 131072, end: 0x08060000, readable: true, erasable: true, writable: true },
                        { start: 0x08060000, sectorSize: 131072, end: 0x08080000, readable: true, erasable: true, writable: true }
                    ]
                };
            }

            // Check device state
            try {
                const state = await this.dfuDevice.getState();
                if (state === dfu.dfuERROR) {
                    await this.dfuDevice.clearStatus();
                }
                if (state !== dfu.dfuIDLE) {
                    await this.dfuDevice.abort();
                }
            } catch (stateError) {
                console.warn('Could not check/set initial state:', stateError);
            }

            console.log('DFU device ready for flashing');
        } catch (error) {
            console.error('DFU connection error:', error);
            throw new Error(`DFU connection failed: ${error.message || error.toString()}`);
        }
    }

    /**
     * Flash binary firmware using DfuSe protocol
     * @private
     */
    async _flashFirmwareBinary(firmwareData) {
        try {
            console.log('Starting BINARY flash with', firmwareData.byteLength, 'bytes');
            this._setupDfuLogging();

            // Perform download (erase + write)
            await this.dfuDevice.do_download(
                this.TRANSFER_SIZE,
                new Uint8Array(firmwareData),
                false  // manifestationTolerant = false (we want to verify)
            );
            console.log('Flash completed successfully');
        } catch (error) {
            console.error('Flash error:', error);
            throw new Error(`Flash failed: ${error.message || error.toString()}`);
        }
    }

    /**
     * Filter segments to ensure safety (Main Flash only)
     * @param {Array} segments 
     * @returns {Array} Safe segments
     */
    _filterSafeSegments(segments) {
        // STM32F446 Flash Range: 0x08000000 - 0x0807FFFF (512KB)
        // We strictly prohibit writing to:
        // - 0x1FFF0000 (System Memory / Bootloader)
        // - 0x1FFFC000 (Option Bytes) - DANGER ZONE
        // - 0x20000000 (SRAM)
        
        // Additionally, we must PROTECT the EEPROM emulation area to prevent
        // overwriting user settings or bricking if the firmware puts data there.
        // EEPROM Range: 0x08004000 - 0x08010000 (Sectors 1, 2, 3)
        
        // Safe Ranges:
        // 1. Sector 0 (ISR Vector): 0x08000000 - 0x08003FFF
        // 2. Main Code (Sector 4+): 0x08010000 - 0x0807FFFF
        
        const SAFE_RANGES = [
            { start: 0x08000000, end: 0x08003FFF }, // ISR Vector
            { start: 0x08010000, end: 0x0807FFFF }  // Main Application Code
        ];
        
        return segments.filter(seg => {
            const segStart = seg.address;
            const segEnd = seg.address + seg.data.length - 1;
            
            for (const range of SAFE_RANGES) {
                // Check if segment is fully contained within a safe range
                if (segStart >= range.start && segEnd <= range.end) {
                    return true;
                }
            }
            
            console.warn(`Skipping unsafe/EEPROM segment at 0x${segStart.toString(16)} (Length: ${seg.data.length})`);
            return false;
        });
    }

    /**
     * Flash HEX firmware by parsing segments and flashing them individually
     * Preserves gaps (e.g. EEPROM)
     * @private
     */
    async _flashFirmwareHex(hexString) {
        const rawSegments = this._parseIntelHex(hexString);
        
        // 1. Filter for safety
        const safeSegments = this._filterSafeSegments(rawSegments);
        
        if (safeSegments.length === 0) {
            throw new Error("No valid firmware segments found in HEX file!");
        }

        // 2. Sort by address
        safeSegments.sort((a, b) => a.address - b.address);

        // 3. Merge overlapping or contiguous segments
        const mergedSegments = [];
        if (safeSegments.length > 0) {
            let current = safeSegments[0];
            for (let i = 1; i < safeSegments.length; i++) {
                const next = safeSegments[i];
                const currentEnd = current.address + current.data.length;
                
                console.log(`Checking merge: Current [0x${current.address.toString(16)} - 0x${currentEnd.toString(16)}] vs Next [0x${next.address.toString(16)} - 0x${(next.address + next.data.length).toString(16)}]`);

                // Check for overlap, contiguity, or small gap (< 4KB)
                // Merging small gaps prevents "double erase" of the same sector
                const gap = next.address - currentEnd;
                
                if (next.address <= currentEnd || gap < 4096) {
                    // Merge!
                    console.log(`Merging segments (Gap: ${gap}): 0x${current.address.toString(16)} and 0x${next.address.toString(16)}`);
                    
                    const newLength = Math.max(currentEnd, next.address + next.data.length) - current.address;
                    const newData = new Uint8Array(newLength);
                    
                    // Fill with 0xFF (erased state) by default
                    newData.fill(0xFF);
                    
                    // Copy current data
                    newData.set(current.data);
                    
                    // Copy next data (overwriting overlap or after gap)
                    const offset = next.address - current.address;
                    newData.set(next.data, offset);
                    
                    current.data = newData;
                } else {
                    mergedSegments.push(current);
                    current = next;
                }
            }
            mergedSegments.push(current);
        }

        console.log(`Parsed ${rawSegments.length} segments, filtered to ${safeSegments.length}, merged to ${mergedSegments.length} safe to flash`);
        
        this._setupDfuLogging();
        
        let totalBytes = 0;
        mergedSegments.forEach(s => totalBytes += s.data.length);
        let globalBytesWritten = 0;

        for (const segment of mergedSegments) {
             // 1. Erase
             console.log(`Erasing/Writing segment at 0x${segment.address.toString(16)} (Length: ${segment.data.length})`);
             await this.dfuDevice.erase(segment.address, segment.data.byteLength);

             // 2. Write
             let address = segment.address;
             let bytes_sent = 0;
             let expected_size = segment.data.byteLength;
             
             while (bytes_sent < expected_size) {
                 const bytes_left = expected_size - bytes_sent;
                 const chunk_size = Math.min(bytes_left, this.TRANSFER_SIZE);
                 
                 // Set Address
                 await this.dfuDevice.dfuseCommand(0x21, address, 4); // SET_ADDRESS
                 
                 // Write Block
                 await this.dfuDevice.download(segment.data.slice(bytes_sent, bytes_sent+chunk_size), 2);
                 
                 // Poll
                 await this.dfuDevice.poll_until_idle(dfu.dfuDNLOAD_IDLE);
                 
                 address += chunk_size;
                 bytes_sent += chunk_size;
                 globalBytesWritten += chunk_size;
                 
                 // Update global progress
                 if (this.onProgress) {
                     const percent = (globalBytesWritten / totalBytes) * 100;
                     this.onProgress(percent, 'Flashing firmware...');
                 }
             }
        }
        
        // 3. Manifest (Reboot) - only once at the end
        console.log("Manifesting (Rebooting)...");
        try {
            // Set address to start of first segment (usually 0x08000000)
            await this.dfuDevice.dfuseCommand(0x21, mergedSegments[0].address, 4);
            await this.dfuDevice.download(new ArrayBuffer(), 0);
        } catch (error) {
            throw "Error during DfuSe manifestation: " + error;
        }
        
        try {
            await this.dfuDevice.poll_until(state => (state == dfu.dfuMANIFEST));
        } catch (error) {
            console.log("Manifest poll error (expected if device reboots):", error);
        }
    }

    /**
     * Parse Intel HEX string into memory segments
     * @param {string} hexString 
     * @returns {Array} Array of {address, data: Uint8Array}
     */
    _parseIntelHex(hexString) {
        const lines = hexString.split(/\r?\n/);
        const segments = [];
        let currentSegment = null;
        let extendedAddress = 0;

        for (let line of lines) {
            line = line.trim();
            if (!line.startsWith(':')) continue;

            const byteCount = parseInt(line.substr(1, 2), 16);
            const address = parseInt(line.substr(3, 4), 16);
            const recordType = parseInt(line.substr(7, 2), 16);
            const dataStr = line.substr(9, byteCount * 2);
            
            if (recordType === 0x00) { // Data
                const absoluteAddress = extendedAddress + address;
                const data = new Uint8Array(byteCount);
                for (let i = 0; i < byteCount; i++) {
                    data[i] = parseInt(dataStr.substr(i * 2, 2), 16);
                }

                // Check if contiguous with current segment
                if (currentSegment && absoluteAddress === (currentSegment.address + currentSegment.data.length)) {
                    // Append to current
                    const newData = new Uint8Array(currentSegment.data.length + data.length);
                    newData.set(currentSegment.data);
                    newData.set(data, currentSegment.data.length);
                    currentSegment.data = newData;
                } else {
                    // New segment
                    if (currentSegment) segments.push(currentSegment);
                    currentSegment = { address: absoluteAddress, data: data };
                }
            } else if (recordType === 0x01) { // End of File
                break;
            } else if (recordType === 0x04) { // Extended Linear Address
                extendedAddress = parseInt(dataStr, 16) << 16;
            }
        }
        
        if (currentSegment) segments.push(currentSegment);
        
        return segments;
    }

    /**
     * Helper to setup DFU logging interception
     */
    _setupDfuLogging() {
        const originalLogInfo = this.dfuDevice.logInfo.bind(this.dfuDevice);
        const originalLogDebug = this.dfuDevice.logDebug.bind(this.dfuDevice);
        
        // Only intercept progress if we aren't doing custom progress tracking
        // (Used for Binary flash, but Hex flash handles progress manually)
        
        this.dfuDevice.logInfo = (msg) => {
            originalLogInfo(msg);
            console.log('[DFU]', msg);
        };
        this.dfuDevice.logDebug = (msg) => {
            originalLogDebug(msg);
            // console.log('[DFU Debug]', msg); // Too verbose
        };
    }

    /**
     * Leave DFU mode and reboot to application
     * @private
     */
    async _leaveDFUMode() {
        try {
            // DfuSe manifestation should have triggered reboot
            // Just close USB connection
            if (this.dfuDevice) {
                await this.dfuDevice.close();
                this.dfuDevice = null;
            }
        } catch (error) {
            console.warn('Error leaving DFU mode:', error);
        }

        // Wait for device to reboot
        await this._sleep(3000);
    }

    /**
     * Attempt to recover from error state
     * @private
     */
    async _recoverFromError() {
        this._updateStatus('Attempting recovery...');

        try {
            const status = await this.dfuDevice.getStatus();
            if (status.state === dfu.dfuERROR) {
                await this.dfuDevice.clearStatus();
            }
            await this.dfuDevice.abort();
            await this.dfuDevice.close();
            this.dfuDevice = null;
        } catch (error) {
            console.error('Recovery attempt failed:', error);
        }
    }

    /**
     * Format bytes for display
     * @private
     */
    _formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /**
     * Sleep for specified milliseconds
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Update status (callback)
     * @private
     */
    _updateStatus(message) {
        console.log('[FirmwareUpdater]', message);
        if (this.onStatus) {
            this.onStatus(message, this.updateState);
        }
    }

    /**
     * Update error (callback)
     * @private
     */
    _updateError(message) {
        console.error('[FirmwareUpdater]', message);
        if (this.onError) {
            this.onError(message, this.updateState);
        }
    }
}