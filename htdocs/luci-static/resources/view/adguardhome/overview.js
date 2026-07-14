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
		const initialStatus = data[1] || {};
		const initialUpdate = data[2] || {};
		const statusText = E('strong');
		const redirectText = E('span');
		const versionText = E('span');
		const updateLog = E('pre', {
			'style': 'max-height:18rem;overflow:auto;white-space:pre-wrap;margin:0'
		});
		const updateButton = E('button', {
			'class': 'btn cbi-button cbi-button-action'
		}, [ _('Check for updates') ]);

		const renderStatus = (state) => {
			statusText.style.color = state.running ? 'green' : 'red';
			dom.content(statusText, state.running ? _('RUNNING') : _('NOT RUNNING'));
			redirectText.style.color = state.redirected ? 'green' : 'gray';
			dom.content(redirectText, state.redirected ? _('DNS redirection active') : _('DNS redirection inactive'));
			dom.content(versionText, state.version || (state.installed ? _('Unknown version') : _('Core is not installed')));
		};

		const renderUpdate = (state) => {
			updateButton.disabled = !!state.running;
			dom.content(updateButton, state.running ? _('Updating…') : _('Check for updates'));
			dom.content(updateLog, state.log || _('No update has been run yet.'));
		};

		const runAction = (action) => {
			return callAction(action).then((res) => {
				if (!res.result)
					throw new Error(_('Service action failed.'));
				return callStatus().then(renderStatus);
			}).catch((e) => ui.addNotification(null, E('p', e.message), 'error'));
		};

		updateButton.addEventListener('click', ui.createHandlerFn(this, () => {
			return callUpdateStart(false).then((res) => {
				if (!res.result && !res.running)
					throw new Error(_('Unable to start the update task.'));
				return callUpdateStatus().then(renderUpdate);
			}).catch((e) => ui.addNotification(null, E('p', e.message), 'error'));
		}));

		const actionButtons = E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, () => runAction('start')) }, _('Start')),
			' ',
			E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, () => runAction('restart')) }, _('Restart')),
			' ',
			E('button', { 'class': 'btn cbi-button cbi-button-negative', 'click': ui.createHandlerFn(this, () => runAction('stop')) }, _('Stop'))
		]);

		const statusTable = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left', 'width': '33%' }, _('Service')), E('td', { 'class': 'td left' }, statusText) ]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Version')), E('td', { 'class': 'td left' }, versionText) ]),
			E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Redirect')), E('td', { 'class': 'td left' }, redirectText) ])
		]);

		let m = new form.Map('AdGuardHome', _('AdGuard Home'),
			_('AdGuard Home integration settings. DNS query performance is provided by the official AdGuard Home core.'));
		let s = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('General settings'));
		s.anonymous = true;
		let o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;
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
		o = s.option(form.Value, 'binpath', _('Core executable'));
		o.default = '/usr/bin/AdGuardHome/AdGuardHome';
		o.rmempty = false;
		o = s.option(form.Value, 'configpath', _('Configuration file'));
		o.default = '/etc/AdGuardHome.yaml';
		o.rmempty = false;
		o = s.option(form.Value, 'workdir', _('Working directory'));
		o.default = '/usr/bin/AdGuardHome';
		o.rmempty = false;
		o = s.option(form.Value, 'logfile', _('Runtime log'));
		o.placeholder = '/tmp/AdGuardHome.log';
		o.description = _('Use “syslog” to read the system log, or leave empty to disable file logging.');
		o = s.option(form.Flag, 'verbose', _('Verbose logging'));

		let us = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('Core updates'));
		us.anonymous = true;
		o = us.option(form.ListValue, 'update_channel', _('Channel'));
		o.value('release', _('Stable'));
		o.value('beta', _('Beta'));
		o.default = 'release';
		o = us.option(form.ListValue, 'arch', _('Architecture'));
		o.value('', _('Automatic'));
		[ '386', 'amd64', 'armv5', 'armv6', 'armv7', 'arm64', 'mips_softfloat', 'mips64_softfloat', 'mipsle_softfloat', 'mips64le_softfloat', 'ppc64le' ].forEach((arch) => o.value(arch));
		o.rmempty = true;

		let as = m.section(form.NamedSection, 'AdGuardHome', 'AdGuardHome', _('Maintenance'));
		as.anonymous = true;
		o = as.option(form.MultiValue, 'crontab', _('Scheduled tasks'));
		o.value('autoupdate', _('Update the core daily'));
		o.value('cutquerylog', _('Limit the query log hourly'));
		o.value('cutruntimelog', _('Limit the runtime log daily'));
		o.value('autohost', _('Refresh IPv6 hosts hourly'));
		o.value('autogfw', _('Refresh the GFW upstream list daily'));
		o.value('autogfwipset', _('Refresh the GFW ipset list daily'));
		o = as.option(form.Value, 'gfwupstream', _('GFW list upstream DNS'));
		o.default = 'tcp://208.67.220.220:5353';
		o = as.option(form.MultiValue, 'backupfile', _('Data to back up when stopping'));
		[ 'filters', 'stats.db', 'querylog.json', 'sessions.db' ].forEach((name) => o.value(name));
		o = as.option(form.Value, 'backupwdpath', _('Backup directory'));
		o.default = '/usr/bin/AdGuardHome';
		o.depends('backupfile', /.+/);

		renderStatus(initialStatus);
		renderUpdate(initialUpdate);
		poll.add(() => {
			if (document.hidden)
				return Promise.resolve();
			return Promise.all([
				callStatus().then(renderStatus),
				callUpdateStatus().then(renderUpdate)
			]);
		}, 10);

		return m.render().then((formNode) => E([], [
			E('div', { 'class': 'cbi-map' }, [
				E('h2', {}, _('AdGuard Home')),
				E('div', { 'class': 'cbi-section' }, [ statusTable, actionButtons ])
			]),
			formNode,
			E('div', { 'class': 'cbi-map' }, [
				E('h3', {}, _('Core update')),
				E('div', { 'class': 'cbi-section' }, [ updateButton, E('div', { 'style': 'margin-top:1rem' }, updateLog) ])
			])
		]));
	}
});
