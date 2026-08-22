# catalog

Owns Provider, Model Definition, and immutable Revision application ports. Persistence stays behind
`src/infrastructure/postgres`; this module never imports `pg` or HTTP.
