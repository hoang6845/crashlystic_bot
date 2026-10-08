#!/bin/sh
set -eu
umask 077
mkdir -p "${DOCKER_DATA_DIR:-/data}"
exec flock -n -E 73 "${DOCKER_DATA_DIR:-/data}/report.lock" "$@"
