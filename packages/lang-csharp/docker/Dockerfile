# Pinned, not a floating tag (same reasoning as TypeScript's/Java's Dockerfiles).
FROM mcr.microsoft.com/dotnet/sdk:10.0
# NuGet's default package cache lives under $HOME/.nuget/packages - a non-root --user run
# overrides HOME (see docker-exec.ts), which would otherwise silently point restore at a
# different, empty cache on every such run (same class of bug the TypeScript/Java Dockerfiles'
# COREPACK_HOME/MAVEN_OPTS fixes address).
ENV NUGET_PACKAGES=/opt/nuget-packages
