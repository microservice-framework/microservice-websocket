# microservice-websocket

[![Gitter](https://img.shields.io/gitter/room/microservice-framework/chat.svg?style=flat-square)](https://gitter.im/microservice-framework/chat)
[![npm](https://img.shields.io/npm/dt/@microservice-framework/microservice-websocket.svg?style=flat-square)](https://www.npmjs.com/~microservice-framework)
[![microservice-frame.work](https://img.shields.io/badge/online%20docs-200-green.svg?style=flat-square)](http://microservice-frame.work)

Websocket service to provide API access and receive information about new data.

# Configure NGINX to proxy WebSocket requests

```nginx
upstream apiv1ws {
    server api1.server.com:6001;
    server api2.server.com:6001;
}

server {
    listen       443 ssl;
    server_name  my-server.com www.my-server.com;
    underscores_in_headers on;
    large_client_header_buffers 4 64k;
    ssl_certificate ssl/my-server.com.crt;
    ssl_certificate_key ssl/my-server.com.key;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location /ws_endpoint/ {
      limit_conn                 conn_from_one_ip 20;
      proxy_pass                 http://apiv1ws/;
      proxy_http_version         1.1;
      proxy_send_timeout         15m;
      proxy_read_timeout         15m;
      proxy_set_header           Upgrade $http_upgrade;
      proxy_set_header           Connection "upgrade";
      proxy_set_header           Host       $host;
      proxy_set_header           X-Real-IP  $remote_addr;
      proxy_set_header           HTTP_X_FORWARDED_FOR  $remote_addr;
      proxy_set_header           X-Forwarded-For $proxy_add_x_forwarded_for;
    }

}
    
```

# WebBrowser Javascript example:

```html
    <script src="http://microservice-frame.work/js/microservice-client.min.js"></script>
    <script>
$(function() {    
    var clientSettings = {
      URL: "wss://my-server.com/ws_endpoint/",
      token: 'secureKey or AccessToken'
    }
    ws = new MicroserviceWebSocket(clientSettings);
    ws.on('message', function(object){
      console.log(object);
    });
});
    </script>
```
