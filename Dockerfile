FROM docker.io/library/nginx:alpine

COPY dist/ /usr/share/nginx/html/

EXPOSE 80
