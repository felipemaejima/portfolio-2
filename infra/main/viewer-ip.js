// CloudFront Function (viewer request, /api/* only): hands the real viewer IP to the API in a header the client
// cannot forge — any incoming value is overwritten here. The API rate-limits on it (CLIENT_IP_HEADER).
// X-Forwarded-For is not used for this: its leading entries are whatever the client sent.
function handler(event) {
  event.request.headers['x-viewer-ip'] = { value: event.viewer.ip };
  return event.request;
}
