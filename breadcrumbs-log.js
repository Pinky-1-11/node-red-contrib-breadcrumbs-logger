const https = require('https');

module.exports = function (RED) {

    // ── Config node ──────────────────────────────────────────────────────────
    function BreadcrumbsConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        // credentials.token is injected by Node-RED from encrypted storage
    }

    RED.nodes.registerType('breadcrumbs-config', BreadcrumbsConfigNode, {
        credentials: {
            token: { type: 'password' }
        }
    });

    // ── Log node ─────────────────────────────────────────────────────────────
    function BreadcrumbsLogNode(config) {
        RED.nodes.createNode(this, config);

        this.configNode = RED.nodes.getNode(config.server);
        this.severity   = config.severity || 'info';

        const node = this;

        node.on('input', function (msg, send, done) {
            // Node-RED < 1.0 back-compat
            send = send || function () { node.send.apply(node, arguments); };
            done = done || function (err) { if (err) { node.error(err, msg); } };

            const token = node.configNode &&
                          node.configNode.credentials &&
                          node.configNode.credentials.token;

            if (!token) {
                node.status({ fill: 'red', shape: 'dot', text: 'no token' });
                done(new Error('Breadcrumbs: no API token configured'));
                return;
            }

            const severity = msg.severity || node.severity;
            const message  = typeof msg.payload === 'string'
                ? msg.payload
                : JSON.stringify(msg.payload);

            const body = JSON.stringify({
                message:   message,
                severity:  severity,
                timestamp: new Date().toISOString(),
                topic:     msg.topic || undefined
            });

            node.status({ fill: 'grey', shape: 'dot', text: 'sending…' });

            const options = {
                hostname: 'breadcrumbs.rutta.net',
                path:     '/api/v1',
                method:   'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type':  'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const req = https.request(options, function (res) {
                let raw = '';
                res.on('data', function (chunk) { raw += chunk; });
                res.on('end', function () {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        node.status({ fill: 'green', shape: 'dot', text: 'success' });
                        setTimeout(function () { node.status({}); }, 3000);
                        send(msg);
                        done();
                    } else {
                        const errMsg = `HTTP ${res.statusCode}: ${raw}`;
                        node.status({ fill: 'red', shape: 'dot', text: `error ${res.statusCode}` });
                        done(new Error(errMsg));
                    }
                });
            });

            req.on('error', function (err) {
                node.status({ fill: 'red', shape: 'dot', text: 'error' });
                done(err);
            });

            req.write(body);
            req.end();
        });

        node.on('close', function () {
            node.status({});
        });
    }

    RED.nodes.registerType('breadcrumbs-log', BreadcrumbsLogNode);
};
