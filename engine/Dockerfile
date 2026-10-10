# Image for the server Container that runs the engine (docs/engine.md): a static musl build of autostacc-engine on an
# empty base, so the image is a few MB, starts fast and has nothing else to attack. Built by `wrangler deploy` in
# workers/engine/ (that config points here); it listens on 8080 for the engine Worker only.
FROM rust:1.90-alpine AS build
RUN apk add --no-cache musl-dev ca-certificates
WORKDIR /src
COPY Cargo.toml Cargo.lock rustfmt.toml ./
COPY src ./src
RUN cargo build --release --locked --bin autostacc-engine

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /src/target/release/autostacc-engine /autostacc-engine
USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/autostacc-engine", "serve", "0.0.0.0:8080"]
