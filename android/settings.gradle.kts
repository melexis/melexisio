pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal() // Recommended for Gradle plugins
    }
}
dependencyResolutionManagement {    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MelexisIOTerminal"
include(":app")
