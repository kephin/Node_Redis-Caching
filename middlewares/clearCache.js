const { clearCache } = require('../services/cache');

module.exports = {
  async clearCacheByUserId(req, res, next) {
    const afterResponse = () => {
      res.removeListener('finish', afterResponse);

      if (res.statusCode < 400) clearCache(req.user.id);
    };

    res.on('finish', afterResponse);
    next();
  },
};

