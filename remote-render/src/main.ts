import {createRemoteRenderServer} from "./server.js";

const port = Number(process.env.PORT ?? "8080");
const server = createRemoteRenderServer();

await server.listen(port, "0.0.0.0");
console.log(`[RemoteRender] listening on 0.0.0.0:${port}`);
