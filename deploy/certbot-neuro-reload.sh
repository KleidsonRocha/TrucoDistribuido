#!/bin/sh
# Executado pelo Certbot somente depois de uma renovação bem-sucedida.
case " ${RENEWED_DOMAINS:-} " in
    *" neuro.clayforgestudio.com.br "*)
        nginx -t && systemctl reload nginx
        ;;
esac
