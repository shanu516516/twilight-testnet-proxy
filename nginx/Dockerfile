FROM nginx:alpine

# envsubst for templating
# RUN apk add --no-cache gettext
RUN apk add --no-cache nginx-mod-http-js gettext ca-certificates
# Where we'll keep the template
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY nginx.http-only.template /etc/nginx/templates/nginx.http-only.template

# njs-gate
COPY verify.js /etc/nginx/njs/verify.js
# Tiny entrypoint: render then run nginx
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx","-g","daemon off;"]
