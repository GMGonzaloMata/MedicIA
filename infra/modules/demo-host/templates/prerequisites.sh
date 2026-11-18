#!/bin/bash
# Solo preparación de la nueva EC2; no construye la app ni inicia servicios.
[[ "$(uname -sm)" == 'Linux x86_64' ]]
source /etc/os-release
[[ "$ID" == amzn && "$VERSION_ID" == 2023 ]]
[[ "$(rpm -q --qf '%{VERSION}' system-release)" == 2023.12.20261021 ]]

medicia_check_global() {
  [[ ! -e /etc/letsencrypt/cli.ini && ! -L /etc/letsencrypt/cli.ini ]]
  for unit in nginx.service certbot-renew.timer certbot.timer; do
    if systemctl is-active --quiet "$unit" || systemctl is-enabled --quiet "$unit"; then false; fi
  done
}
medicia_check_global
medicia_launcher=$'#!/usr/bin/python3\nimport sys\nfrom certbot.main import main\nsys.exit(main())\n'
medicia_check_paths() {
  medicia_managed=false
  if [[ -e /opt/certbot || -L /opt/certbot ]]; then
    [[ -d /opt/certbot && ! -L /opt/certbot && "$(stat -c '%u:%g:%a' /opt/certbot)" == 0:0:755 ]]
    [[ -f /opt/certbot/.medicia-bootstrap-v1 && ! -L /opt/certbot/.medicia-bootstrap-v1 ]]
    [[ "$(stat -c '%u:%g:%a' /opt/certbot/.medicia-bootstrap-v1)" == 0:0:600 ]]
    cmp -s /opt/certbot/.medicia-bootstrap-v1 <(printf 'medicia-standard-certbot-v1\n')
    [[ ! -L /opt/certbot/bin ]]
    if [[ -e /opt/certbot/bin ]]; then
      [[ -d /opt/certbot/bin && "$(stat -c '%u:%g:%a' /opt/certbot/bin)" == 0:0:755 ]]
    fi
    if [[ -e /opt/certbot/bin/certbot || -L /opt/certbot/bin/certbot ]]; then
      [[ -f /opt/certbot/bin/certbot && ! -L /opt/certbot/bin/certbot ]]
      [[ "$(stat -c '%u:%g:%a' /opt/certbot/bin/certbot)" == 0:0:700 ]]
      cmp -s /opt/certbot/bin/certbot <(printf '%s' "$medicia_launcher")
    fi
    medicia_managed=true
  fi
  [[ ! -L /etc/pki/rds && ! -L /etc/pki/rds/global-bundle.pem ]]
  if [[ -e /etc/pki/rds/global-bundle.pem ]]; then
    [[ "$medicia_managed" == true && -f /etc/pki/rds/global-bundle.pem ]]
    [[ "$(stat -c '%u:%g:%a' /etc/pki/rds/global-bundle.pem)" == 0:0:644 ]]
  fi
}
medicia_check_paths

# EIP se asocia después de crear EC2: límite total finito, sin cambiar repos.
medicia_packages_ready=false
for medicia_attempt in 1 2 3; do
  if timeout 180 dnf -q -y --exclude=certbot --setopt=gpgcheck=1 --setopt=install_weak_deps=False --setopt=timeout=20 --setopt=retries=2 install nodejs24 awscli-2 amazon-ssm-agent nginx python3-certbot ca-certificates openssl tar gzip util-linux shadow-utils; then
    medicia_packages_ready=true
    break
  fi
  if [[ "$medicia_attempt" != 3 ]]; then sleep 5; fi
done
[[ "$medicia_packages_ready" == true ]]
medicia_check_global
medicia_check_paths
alternatives --set node /usr/bin/node-24
[[ "$(/usr/bin/node --version)" =~ ^v24[.] ]]
command -v aws >/dev/null
[[ -x /usr/sbin/nginx ]]
getent passwd nginx >/dev/null
getent group nginx >/dev/null
systemctl cat amazon-ssm-agent.service >/dev/null

install -d -o root -g root -m 0755 /opt/certbot /opt/certbot/bin /etc/pki/rds
if [[ "$medicia_managed" == false ]]; then
  printf 'medicia-standard-certbot-v1\n' > /opt/certbot/.medicia-bootstrap-v1
  chmod 0600 /opt/certbot/.medicia-bootstrap-v1
fi
medicia_stage=$(mktemp -d /opt/certbot/.bootstrap.XXXXXX)
trap 'rm -f -- "$medicia_stage/launcher" "$medicia_stage/global-bundle.pem"; rmdir -- "$medicia_stage"' EXIT
printf '%s' "$medicia_launcher" > "$medicia_stage/launcher"
install -o root -g root -m 0700 "$medicia_stage/launcher" /opt/certbot/bin/certbot
[[ "$(/opt/certbot/bin/certbot --version)" == 'certbot 2.6.0' ]]
timeout 60 curl --disable --fail --silent --show-error --proto '=https' --tlsv1.2 --noproxy '*' --connect-timeout 10 --max-time 20 --retry 2 --retry-max-time 45 --max-filesize 1048576 --output "$medicia_stage/global-bundle.pem" https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
[[ -s "$medicia_stage/global-bundle.pem" ]]
grep -q '^-----BEGIN CERTIFICATE-----$' "$medicia_stage/global-bundle.pem"
if ! medicia_subjects=$(openssl crl2pkcs7 -nocrl -certfile "$medicia_stage/global-bundle.pem" -outform DER | openssl pkcs7 -inform DER -print_certs -noout); then false; fi
[[ -n "$medicia_subjects" ]]
install -o root -g root -m 0644 "$medicia_stage/global-bundle.pem" /etc/pki/rds/global-bundle.pem
rm -f -- "$medicia_stage/launcher" "$medicia_stage/global-bundle.pem"
rmdir -- "$medicia_stage"
trap - EXIT
unset medicia_stage medicia_subjects medicia_launcher
