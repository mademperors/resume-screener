#!/bin/sh
# Starts SeaweedFS with one S3 identity built from S3_ACCESS_KEY_ID and
# S3_SECRET_ACCESS_KEY (the same values the app uses, from .env), so the
# credentials live in one place. Arguments are passed to `weed`.
set -eu

: "${S3_ACCESS_KEY_ID:?Set S3_ACCESS_KEY_ID in .env}"
: "${S3_SECRET_ACCESS_KEY:?Set S3_SECRET_ACCESS_KEY in .env}"

config=/tmp/s3.json
cat > "$config" <<EOF
{
  "identities": [
    {
      "name": "screener",
      "credentials": [
        { "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }
      ],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
EOF

exec weed "$@" -s3.config="$config"
