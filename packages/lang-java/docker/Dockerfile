# Pinned, not a floating tag (same reasoning as TypeScript's Dockerfile / oasdiff's image pin).
FROM maven:3.9.9-eclipse-temurin-21
# Maven's local repo defaults under $HOME/.m2 - a non-root --user run overrides HOME (see
# docker-exec.ts), which would otherwise silently point Maven at a different, empty repo on
# every such run (same class of bug the TypeScript Dockerfile's COREPACK_HOME fix addresses).
ENV MAVEN_OPTS="-Dmaven.repo.local=/opt/maven-repo"
