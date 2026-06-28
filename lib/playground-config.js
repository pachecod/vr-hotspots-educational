function isPublicPlaygroundEnabled() {
  return process.env.PUBLIC_PLAYGROUND_ENABLED === 'true';
}

module.exports = { isPublicPlaygroundEnabled };
