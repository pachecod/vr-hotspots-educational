require('dotenv').config();
const b2Service = require('./services/b2-service');

(async () => {
  try {
    await b2Service.ensureCommonAssetsBucket();
    await b2Service.applyCommonAssetsCorsRules();
    console.log('✅ CORS rules updated on the public common-assets bucket.');
    process.exit(0);
  } catch (e) {
    console.error('Script Error:', e.message);
    process.exit(1);
  }
})();
