// SPDX-License-Identifier: Apache-2.0
'use strict';
'require dom';
'require poll';
'require rpc';
'require ui';
'require view';

const callRead = rpc.declare({ object: 'luci.adguardhome', method: 'log_read', params: [ 'offset' ], expect: { '': {} } });
const callClear = rpc.declare({ object: 'luci.adguardhome', method: 'log_clear', expect: { '': {} } });

return view.extend({
	load() { return callRead(0); },
	render(initial) {
		let offset = initial.offset || 0;
		let lines = (initial.data || '').split('\n');
		const output = E('pre', {
			'style': 'height:32rem;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0'
		});
		const update = (result) => {
			if (result.snapshot)
				lines = (result.data || '').split('\n');
			else if (result.data)
				lines = lines.concat(result.data.split('\n'));
			if (lines.length > 1000)
				lines = lines.slice(lines.length - 1000);
			offset = result.offset || 0;
			dom.content(output, lines.join('\n'));
			output.scrollTop = output.scrollHeight;
		};
		update(initial || {});
		poll.add(() => document.hidden ? Promise.resolve() : callRead(offset).then(update), 5);
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('AdGuard Home log')),
			E('div', { 'class': 'cbi-section' }, [ output ]),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-negative',
					'click': ui.createHandlerFn(this, () => callClear().then((res) => {
						if (!res.result)
							throw new Error(res.error || _('Unable to clear the log.'));
						lines = []; offset = 0; dom.content(output, '');
					}).catch((e) => ui.addNotification(null, E('p', e.message), 'error')))
				}, _('Clear log'))
			])
		]);
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
