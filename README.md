# luci-app-adguardhome-next

A modern, low-overhead LuCI integration for the official
[AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) core.

## Highlights

- Modern LuCI JavaScript views instead of legacy Lua CBI templates.
- Structured rpcd/ubus API with a narrow ACL.
- procd-native service supervision and service status reporting.
- Incremental, per-browser log cursors with bounded rendering.
- Validated and atomic YAML configuration replacement.
- firewall4-compatible DNS redirection managed through UCI.
- TLS-verified core downloads, an update lock, and rollback on failure.
- Idempotent managed cron block that preserves user-created jobs.
- Compatible with the historical `AdGuardHome.AdGuardHome` UCI section.

This package manages the integration layer only. DNS filtering and query
performance are provided by the upstream AdGuard Home executable.

## Build

Place this repository under an OpenWrt build tree's `package/` directory and
run:

```sh
make menuconfig
# LuCI -> Applications -> luci-app-adguardhome
make package/luci-app-adguardhome/compile V=s
```

Every push and pull request is also built with an official OpenWrt SDK by
GitHub Actions. Successful workflow runs publish the generated package as an
artifact.

## Migration

Existing UCI settings are kept. The historical default configuration path
`/etc/config/AdGuardHome.yaml` is migrated to `/etc/AdGuardHome.yaml` only when
the old file does not exist. Back up the router before replacing an older
package and verify the selected DNS integration mode after installation.

## License

Apache-2.0
