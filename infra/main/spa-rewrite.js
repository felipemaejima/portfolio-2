// CloudFront Function (viewer request, default behavior only): SPA routes such as /projetos have no file
// extension, so they are served index.html; real files (/assets/app.js) pass through untouched.
// Custom error responses would do this distribution-wide and turn a missing /uploads/x.png into a 200 page.
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
