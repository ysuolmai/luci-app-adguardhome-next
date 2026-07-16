#!/bin/sh
# SPDX-License-Identifier: Apache-2.0

set -u

PATH=/usr/sbin:/usr/bin:/sbin:/bin
RUN_DIR=/var/run/adguardhome
LOCK_DIR="$RUN_DIR/update.lock"
WORK_DIR="$RUN_DIR/update.$$"
LOG_TAG=adguardhome-update
RESULT_FILE="$RUN_DIR/update.result"

mkdir -p "$RUN_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
	echo "An update task is already running."
	exit 2
fi

cleanup() {
	rc=$?
	rm -rf "$WORK_DIR" "$LOCK_DIR"
	if [ "$rc" -eq 0 ]; then
		echo success >"$RESULT_FILE"
	else
		echo failed >"$RESULT_FILE"
	fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$WORK_DIR"
echo running >"$RESULT_FILE"

cfg() {
	uci -q get "AdGuardHome.AdGuardHome.$1"
}

detect_arch() {
	local machine
	machine="$(uname -m)"
	case "$machine" in
		i[3-6]86) echo 386;;
		x86_64) echo amd64;;
		aarch64|arm64) echo arm64;;
		armv7*) echo armv7;;
		armv6*) echo armv6;;
		arm*) echo armv5;;
		mips64el*) echo mips64le_softfloat;;
		mips64*) echo mips64_softfloat;;
		mipsel*) echo mipsle_softfloat;;
		mips*) echo mips_softfloat;;
		ppc64le) echo ppc64le;;
		*) return 1;;
	esac
}

version_of() {
	[ -x "$1" ] || return 0
	"$1" --version 2>/dev/null | sed -n 's/.*\(v[0-9][0-9A-Za-z.\-]*\).*/\1/p' | head -n 1
}

channel="$(cfg update_channel)"; [ -n "$channel" ] || channel="$(cfg tagname)"
[ "$channel" = beta ] || channel=release
binpath="$(cfg binpath)"; [ -n "$binpath" ] || binpath=/usr/bin/AdGuardHome/AdGuardHome
arch="$(cfg arch)"; [ -n "$arch" ] || arch="$(detect_arch)" || {
	echo "Unsupported architecture: $(uname -m)"
	exit 1
}

echo "Checking the $channel channel for architecture $arch…"
if [ "$channel" = beta ]; then
	api=https://api.github.com/repos/AdguardTeam/AdGuardHome/releases?per_page=1
else
	api=https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest
fi
metadata="$WORK_DIR/release.json"
curl --fail --location --silent --show-error \
	--proto '=https' --tlsv1.2 --retry 2 --connect-timeout 15 --max-time 60 \
	-o "$metadata" "$api"
if [ "$channel" = beta ]; then
	latest="$(jsonfilter -i "$metadata" -e '@[0].tag_name')"
else
	latest="$(jsonfilter -i "$metadata" -e '@.tag_name')"
fi
[ -n "$latest" ] || { echo "The release metadata did not contain a version."; exit 1; }

current="$(version_of "$binpath")"
echo "Installed: ${current:-not installed}; available: $latest"
if [ "${1:-}" != force ] && [ -n "$current" ] && [ "$current" = "$latest" ]; then
	echo "The latest version is already installed."
	exit 0
fi

archive="$WORK_DIR/AdGuardHome.tar.gz"
downloaded=0
while IFS= read -r template; do
	case "$template" in ''|'#'*) continue;; esac
	url="$(printf '%s\n' "$template" | sed "s|\${Arch}|$arch|g; s|\${latest_ver}|$latest|g")"
	case "$url" in https://*) :;; *) echo "Skipping non-HTTPS update URL: $url"; continue;; esac
	echo "Downloading $url"
	if curl --fail --location --silent --show-error \
		--proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 600 \
		-o "$archive" "$url"; then
		downloaded=1
		break
	fi
done < /usr/share/AdGuardHome/links.txt
[ "$downloaded" -eq 1 ] || { echo "All download sources failed."; exit 1; }

if tar -tzf "$archive" | grep -qx './AdGuardHome/AdGuardHome'; then
	archive_member=./AdGuardHome/AdGuardHome
elif tar -tzf "$archive" | grep -qx 'AdGuardHome/AdGuardHome'; then
	archive_member=AdGuardHome/AdGuardHome
else
	echo "The archive does not contain the expected executable."
	exit 1
fi
tar -xzf "$archive" -C "$WORK_DIR" "$archive_member"
candidate="$WORK_DIR/AdGuardHome/AdGuardHome"
chmod 755 "$candidate"
candidate_version="$(version_of "$candidate")"
[ -n "$candidate_version" ] || { echo "The downloaded executable failed its version check."; exit 1; }
echo "Downloaded: $candidate_version"

mkdir -p "${binpath%/*}"
new="${binpath}.new.$$"
backup="${binpath}.previous"
cp "$candidate" "$new"
chmod 755 "$new"

/etc/init.d/AdGuardHome stop nobackup >/dev/null 2>&1 || true
if [ -e "$binpath" ]; then
	rm -f "$backup"
	mv "$binpath" "$backup"
fi
if ! mv "$new" "$binpath"; then
	[ -e "$backup" ] && mv "$backup" "$binpath"
	/etc/init.d/AdGuardHome start >/dev/null 2>&1 || true
	echo "Unable to install the downloaded executable."
	exit 1
fi

if ! /etc/init.d/AdGuardHome start >/dev/null 2>&1; then
	rm -f "$binpath"
	[ -e "$backup" ] && mv "$backup" "$binpath"
	/etc/init.d/AdGuardHome start >/dev/null 2>&1 || true
	echo "The service rejected the new executable; the previous version was restored."
	exit 1
fi

rm -f "$backup"
printf '%s\n' "$candidate_version" >"$RUN_DIR/version"
logger -t "$LOG_TAG" "updated AdGuard Home from ${current:-none} to $candidate_version"
echo "Update completed successfully."
