ARG ARCH=amd64
FROM braindoctor/netdata-minimal:${ARCH}

COPY --chown=netdata:root overrides/node.d.json /etc/netdata/overrides/
COPY --chown=root:netdata overrides/clustercode.json /etc/netdata/node.d/clustercode.conf
COPY --chown=root:root clustercode.node.js /usr/libexec/netdata/node.d
