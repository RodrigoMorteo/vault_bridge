const express = require('express');
const { BitwardenClient, DeviceType } = require('@bitwarden/sdk-napi');
const { LogLevel } = require('@bitwarden/sdk-napi/binding');

const stateFile = process.env.BWS_STATE_FILE || "/tmp/bws_state.json";

let client;
let isClientReady = false;
let server;

async function initBitwarden(accessToken = process.env.BWS_ACCESS_TOKEN) {
    if (!accessToken) {
        console.error("FATAL: BWS_ACCESS_TOKEN environment variable is missing.");
        process.exit(1);
    }

    try {
        const bwClient = new BitwardenClient(
            {
                apiUrl: "https://api.bitwarden.com",
                identityUrl: "https://identity.bitwarden.com",
                deviceType: DeviceType.SDK,
            },
            LogLevel.Info,
        );

        await bwClient.auth().loginAccessToken(accessToken, stateFile);
        isClientReady = true;
        console.log("Bitwarden Machine Account Authenticated Successfully.");
        client = bwClient;
        return bwClient;
    } catch (err) {
        console.error("Failed to authenticate with Bitwarden:", err.message);
        process.exit(1);
    }
}

function buildApp({ client: providedClient, isReady = () => true }) {
    const app = express();

    app.get('/health', (_req, res) => {
        if (isReady()) {
            return res.status(200).json({ status: "ok" });
        }
        return res.status(503).json({ status: "unavailable" });
    });

    app.get('/vault/secret/:id', async (req, res) => {
        if (!isReady()) {
            return res.status(503).json({ error: "Vault client not ready" });
        }

        try {
            const secretId = req.params.id;
            const secretResponse = await providedClient.secrets().get(secretId);

            return res.status(200).json({
                id: secretResponse.id,
                key: secretResponse.key,
                value: secretResponse.value,
            });
        } catch (error) {
            console.error(`Error retrieving secret ${req.params.id}:`, error.message);
            return res.status(500).json({ error: "Failed to retrieve secret from vault." });
        }
    });

    return app;
}

async function startServer() {
    const port = process.env.PORT || 65500;
    const initializedClient = client || await initBitwarden();
    const app = buildApp({ client: initializedClient, isReady: () => isClientReady });

    server = app.listen(port, () => {
        console.log(`Vault Bridge listening internally on port ${port}`);
    });

    const shutdown = (signal) => {
        console.log(`Received ${signal}. Shutting down.`);
        server.close(() => {
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    buildApp,
    initBitwarden,
    startServer,
};
