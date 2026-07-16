// SPDX-License-Identifier: Apache-2.0
'use strict';
'require dom';
'require form';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

const callStatus = rpc.declare({
	object: 'luci.adguardhome', method: 'status', expect: { '': {} }
});
const callAction = rpc.declare({
	object: 'luci.adguardhome', method: 'service_action', params: [ 'action' ], expect: { '': {} }
});
const callUpdateStart = rpc.declare({
	object: 'luci.adguardhome', method: 'update_start', params: [ 'force' ], expect: { '': {} }
});
const callUpdateStatus = rpc.declare({
	object: 'luci.adguardhome', method: 'update_status', expect: { '': {} }
});

return view.extend({
	load() {
		return Promise.all([ uci.load('AdGuardHome'), callStatus(), callUpdateStatus() ]);
	},

	render(data) {
		let currentStatus = data[1] || {};
		const statusText = E('strong');
		const redirectText = E('span');
		const versionText = E('span');
		const updateState = E('span', { 'style': 'margin-left:.75rem' });
		const updateLog = E('pre', {
			'style': 'max-height:18rem;overflow:auto;white-space:pre-wrap;margin:.75rem 0 0'
		});
		const updateDetails = E('details', { 'style': 'margin-top:.75rem' }, [
			E('summary', {}, _('Download log')),
			updateLog
		]);
		const updateButton = E('button', { 'class': 'btn cbi-button', 'type': 'button' });
		const startButton = E('button', { 'class': 'btn cbi-button cbi-button-positive', 'type': 'button' }, _('Start'));
		const restartButton = E('button', { 'class': 'btn cbi-button cbi-button-action', 'type': 'button' }, _('Restart'));
		const stopButton = E('button', { 'class': 'btn cbi-button cbi-button-negative', 'type': 'button' }, _('Stop'));
		const webButton = E('button', { 'class': 'btn cbi-button cbi-button-action', 'type': 'button' }, _('Open web interface'));

		const renderStatus = (state) => {
			currentStatus = state || {};
			statusText.style.color = state.running ? 'green' : 'red';
			dom.content(statusText, state.running ? _('RUNNING') : _('NOT RUNNING'));
			redirectText.style.color = state.redirected ? 'green' : 'gray';
			dom.content(redirectText, state.redirected ? _('DNS redirection active') : _('DNS redirection inactive'));
			dom.content(versionText, state.version || (state.installed ? _('Unknown version') : _('Core is not installed')));
			startButton.disabled = !state.installed || !!state.running;
			restartButton.disabled = !state.installed;
			stopButton.disabled = !state.running;
			webButton.disabled = !state.running;
		};

		const renderUpdate = (state) => {
			const running = !!state.running;
			updateButton.disabled = running;
			updateButton.className = 'btn cbi-button ' + (currentStatus.installed ? 'cbi-button-action' : 'cbi-button-positive important');
			dom.content(updateButton, running
				? _('Downloading…')
				: (currentStatus.installed ? _('Check for core updates') : _('Download and install core')));
			updateState.style.color = state.result === 'failed' ? 'red' : (state.result === 'success' ? 'green' : 'gray');
			dom.content(updateState, running ? _('Download in progress') :
				(state.result === 'success' ? _('Last download succeeded') :
				(state.result === 'failed' ? _('Last download failed') : '')));
			dom.content(updateLog, state.log || _('No download has been run yet.'));
			if (running || state.result === 'failed')
				updateDetails.open = true;
		};

		const runAction = (action) => callAction(action).then((res) => {
			if (!res.result)
				throw new Error(action === 'start' && !currentStatus.installed
					? _('Download the AdGuard Home core before starting the service.')
					: _('Service action failed.'));
			return callStatus().then(renderStatus);
		}).catch((e) => ui.addNotification(null, E('p', e.message), 'error'));

		startButton.addEventListener('click', ui.createHandlerFn(this, () => runAction('start')));
		restartButton.addEventListener('click', ui.createHandlerFn(this, () => runAction('restart')));
		stopButton.addEventListener('click', ui.createHandlerFn(this, () => runAction('stop')));
		webButton.addEventListener('click', ui.createHandlerFn(this, () => {
			const url = new URL(window.location.href);
			url.protocol = 'http:';
			url.port = uci.get('AdGuardHome', 'AdGuardHome', 'httpport') || '3000';
			url.pathname = '/';
			url.search = '';
			url.hash = '';
			window.open(url.toString(), '_blank', 'noopener');
		}));
		updateButton.addEventListener('click', ui.createHandlerFn(this, () => {
			updateButton.disabled = true;
			dom.content(updateButton, _('Downloading…'));
			dom.content(updateState, _('Download in progress'));
			return callUpdateStart(false).then((res) => {
				if (!res.result && !res.running)
					throw new Error(_('Unable to start the core download.'));
				updateDetails.open = true;
				return callUpdateStatus().then(renderUpdate);
			}).catch((e) => ui.addNotification(null, E('p', e.message), 'error'));
		}));

		const statusTable = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left', 'width': '33%' }, _('Service')), E('td', { 'class': 'td left' }, statusText) ]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Core version')), E('td', { 'class': 'td left' }, versionText) ]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('DNS integration')), E('td', { 'class': 'td left' }, redirectText) ])
		]);

		const coreControls = E('div', {}, [
			E('div', {}, [ updateButton, updateState ]),
			updateDetails
		]);
		const serviceControls = E('div', {}, [ webButton, ' ', startButton, ' ', restartButton, ' ', stopButton ]);
		const normalizeMultiValueText = (option) => {
			const renderWidget = option.renderWidget;
			option.renderWidget = function(...args) {
				const widget = renderWidget.apply(this, args);
				widget.style.fontSize = '0.875rem';
				widget.querySelectorAll('li, label, span').forEach((node) => node.style.fontSize = 'inherit');
				return widget;
			};
		};

		let m = new form.Map('AdGuardHome', _('AdGuard Home'), _('AdGuard Home service and DNS settings.'));
		let s = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('Quick setup'));
		s.anonymous = true;
		let o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;
		o = s.option(form.DummyValue, '_status', _('Status'));
		o.renderWidget = () => statusTable;
		o = s.option(form.DummyValue, '_core_download', _('AdGuard Home core'));
		o.renderWidget = () => coreControls;
		o = s.option(form.Value, 'httpport', _('Web interface port'));
		o.datatype = 'port';
		o.default = '3000';
		o.rmempty = false;
		o = s.option(form.ListValue, 'redirect', _('DNS integration mode'));
		o.value('none', _('None'));
		o.value('dnsmasq-upstream', _('Use AdGuard Home as dnsmasq upstream'));
		o.value('redirect', _('Redirect LAN DNS traffic to AdGuard Home'));
		o.value('exchange', _('Let AdGuard Home use port 53'));
		o.default = 'none';
		o = s.option(form.DummyValue, '_service_actions', _('Service controls'));
		o.renderWidget = () => serviceControls;

		let cs = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('Advanced core settings'));
		cs.anonymous = true;
		o = cs.option(form.Value, 'binpath', _('Core executable'));
		o.default = '/usr/bin/AdGuardHome/AdGuardHome';
		o.rmempty = false;
		o = cs.option(form.Value, 'configpath', _('Configuration file'));
		o.default = '/etc/AdGuardHome.yaml';
		o.rmempty = false;
		o = cs.option(form.Value, 'workdir', _('Working directory'));
		o.default = '/usr/bin/AdGuardHome';
		o.rmempty = false;
		o = cs.option(form.ListValue, 'update_channel', _('Update channel'));
		o.value('release', _('Stable'));
		o.value('beta', _('Beta'));
		o.default = 'release';
		o = cs.option(form.ListValue, 'arch', _('Download architecture'));
		o.value('', _('Automatic'));
		[ '386', 'amd64', 'armv5', 'armv6', 'armv7', 'arm64', 'mips_softfloat', 'mips64_softfloat', 'mipsle_softfloat', 'mips64le_softfloat', 'ppc64le' ].forEach((arch) => o.value(arch));
		o.rmempty = true;
		o.description = _('Save and apply architecture or path changes before downloading the core.');

		let ls = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('Advanced logging'));
		ls.anonymous = true;
		o = ls.option(form.Value, 'logfile', _('Runtime log'));
		o.placeholder = '/tmp/AdGuardHome.log';
		o.description = _('Use “syslog” to read the system log, or leave empty to disable file logging.');
		o = ls.option(form.Flag, 'verbose', _('Verbose logging'));

		let as = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('Advanced maintenance'));
		as.anonymous = true;
		o = as.option(form.MultiValue, 'crontab', _('Scheduled tasks'));
		o.value('autoupdate', _('Update the core daily'));
		o.value('cutquerylog', _('Limit the query log hourly'));
		o.value('cutruntimelog', _('Limit the runtime log daily'));
		o.value('autohost', _('Refresh IPv6 hosts hourly'));
		o.value('autogfw', _('Refresh the GFW upstream list daily'));
		o.value('autogfwipset', _('Refresh the GFW ipset list daily'));
		normalizeMultiValueText(o);
		o = as.option(form.Value, 'gfwupstream', _('GFW list upstream DNS'));
		o.default = 'tcp://208.67.220.220:5353';
		o = as.option(form.MultiValue, 'backupfile', _('Data to back up when stopping'));
		[ 'filters', 'stats.db', 'querylog.json', 'sessions.db' ].forEach((name) => o.value(name));
		normalizeMultiValueText(o);
		o = as.option(form.Value, 'backupwdpath', _('Backup directory'));
		o.default = '/usr/bin/AdGuardHome';
		o.depends('backupfile', /.+/);

		renderStatus(currentStatus);
		renderUpdate(data[2] || {});
		poll.add(() => {
			if (document.hidden)
				return Promise.resolve();
			return callStatus().then((state) => {
				renderStatus(state);
				return callUpdateStatus().then(renderUpdate);
			});
		}, 3);

		return m.render();
	}
});
