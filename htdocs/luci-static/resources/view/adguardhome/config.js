// SPDX-License-Identifier: Apache-2.0
'use strict';
'require dom';
'require rpc';
'require ui';
'require view';

const callRead = rpc.declare({ object: 'luci.adguardhome', method: 'config_read', expect: { '': {} } });
const callWrite = rpc.declare({ object: 'luci.adguardhome', method: 'config_write', params: [ 'content' ], expect: { '': {} } });

return view.extend({
	load() { return callRead(); },
	render(data) {
		const editor = E('textarea', {
			'class': 'cbi-input-textarea',
			'wrap': 'off',
			'rows': 32,
			'spellcheck': 'false',
			'style': 'width:100%;font-family:monospace'
		}, data.content || '');
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('AdGuard Home configuration')),
			E('div', { 'class': 'cbi-map-descr' },
				_('The configuration is checked by AdGuard Home before it is atomically installed. Saving reloads the service.')),
			E('div', { 'class': 'cbi-section' }, [ editor ]),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-positive important',
					'click': ui.createHandlerFn(this, () => callWrite(editor.value).then((res) => {
						if (!res.result)
							throw new Error(res.error || _('Configuration validation failed.'));
						ui.addNotification(null, E('p', _('Configuration saved and service reloaded.')), 'info');
					}).catch((e) => ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' }, e.message), 'error')))
				}, _('Save and reload'))
			])
		]);
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
