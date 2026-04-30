#ifndef REMOTE_WS_FRAME_CLIENT_H
#define REMOTE_WS_FRAME_CLIENT_H

#include "remote/FrameFetchResult.h"
#include "remote/FrameProtocol.h"
#include "ui/TftFrameSink.h"

#include <Arduino.h>
#include <WebSocketsClient.h>
#include <cstddef>
#include <cstdint>

#include "app/FrameDiagnostics.h"
#include "app/RemoteWebSocketEndpoint.h"

namespace remote
{

class WsFrameClient
{
public:
  explicit WsFrameClient(ui::TftFrameSink &sink);
  ~WsFrameClient();

  FrameFetchResult poll(const String &baseUrl, const String &deviceId, uint32_t haveFrameId, uint32_t waitMs,
                        uint32_t &outFrameId);

private:
  void connect(const app::RemoteWebSocketEndpoint &endpoint, const app::RemoteWebSocketEndpoint &endpointKey);
  void disconnect();
  void handleEvent(WStype_t type, uint8_t *payload, std::size_t length);
  void handleText(const uint8_t *payload, std::size_t length);
  bool handleBinary(uint8_t *payload, std::size_t length);
  bool consumeFrameBuffer(const uint8_t *payload, std::size_t length, const FrameHeader &header,
                          app::FrameDiagnostics &diagnostics);
  bool consumeRawRect(const uint8_t *&cursor, const uint8_t *end, const RectHeader &rect, uint32_t &crc,
                      app::FrameDiagnostics &diagnostics);
  bool consumeRleRect(const uint8_t *&cursor, const uint8_t *end, const RectHeader &rect, uint32_t &crc,
                      app::FrameDiagnostics &diagnostics);
  void sendFrameRequest(uint32_t haveFrameId);

  ui::TftFrameSink &sink_;
  WebSocketsClient websocket_;
  app::RemoteWebSocketEndpoint activeEndpoint_;
  bool endpointActive_ = false;
  bool connected_ = false;
  bool awaitingResponse_ = false;
  bool frameReady_ = false;
  uint32_t latestFrameId_ = 0;
  uint32_t expectedHaveFrameId_ = 0;
  uint32_t lastConnectStartedMs_ = 0;
  uint32_t pendingServerWaitMs_ = 0;
  uint32_t pendingServerRenderMs_ = 0;
  uint32_t pendingServerTotalMs_ = 0;
  uint16_t pendingChunkCount_ = 1;
  uint16_t receivedChunkCount_ = 0;
  uint32_t chunkFrameId_ = 0;
};

} // namespace remote

#endif // REMOTE_WS_FRAME_CLIENT_H
