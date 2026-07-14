#!/bin/sh
# SPDX-License-Identifier: Apache-2.0

set -u
CRON=/etc/crontabs/root
BEGIN='# BEGIN luci-app-adguardhome'
END='# END luci-app-adguardhome'
TMP="/tmp/adguardhome-cron.$$"
MANAGED="/tmp/adguardhome-cron-managed.$$"
trap 'rm -f "$TMP" "$MANAGED"' EXIT INT TERM

mkdir -p /etc/crontabs
touch "$CRON"
awk -v begin="$BEGIN" -v end="$END" '
	$0 == begin { skip=1; next }
	$0 == end { skip=0; next }
	!skip { print }
' "$CRON" >"$TMP"

enabled="$(uci -q get AdGuardHome.AdGuardHome.enabled)"
tasks="$(uci -q get AdGuardHome.AdGuardHome.crontab)"
if [ "$enabled" = 1 ] && [ -n "$tasks" ]; then
	{
		echo "$BEGIN"
		case " $tasks " in *' autoupdate '*) echo '30 3 * * * /usr/share/AdGuardHome/update_core.sh >/var/run/adguardhome/update.log 2>&1';; esac
		case " $tasks " in *' cutquerylog '*) echo '0 * * * * /usr/share/AdGuardHome/tailto.sh 2000 "$(uci -q get AdGuardHome.AdGuardHome.workdir)/data/querylog.json"';; esac
		case " $tasks " in *' cutruntimelog '*) echo '30 3 * * * /usr/share/AdGuardHome/tailto.sh 2000 "$(uci -q get AdGuardHome.AdGuardHome.logfile)"';; esac
		case " $tasks " in *' autohost '*) echo '0 * * * * /usr/share/AdGuardHome/addhost.sh';; esac
		case " $tasks " in *' autogfw '*) echo '30 3 * * * /usr/share/AdGuardHome/gfw2adg.sh';; esac
		case " $tasks " in *' autogfwipset '*) echo '31 3 * * * /usr/share/AdGuardHome/gfwipset2adg.sh';; esac
		echo "$END"
	} >"$MANAGED"
	cat "$MANAGED" >>"$TMP"
fi

if ! cmp -s "$TMP" "$CRON"; then
	mv -f "$TMP" "$CRON"
	/etc/init.d/cron restart >/dev/null 2>&1
fi
