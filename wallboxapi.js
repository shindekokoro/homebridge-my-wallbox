'use strict';
const axios = require('axios');
const rax = require('retry-axios'); //v3.0.0 ES6 only
const userEndpoint = 'https://user-api.wall-box.com';
const endpoint = 'https://api.wall-box.com';
const fileName = 'API';

class wallboxAPI {
  constructor(platform, log) {
    this.log = log;
    this.platform = platform;
    this.interceptorId = rax.attach();
  }

  async checkEmail(email) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving device, checking email.`);
      let response = await axios({
        method: 'get',
        baseURL: userEndpoint,
        url: `/users/emails/${email}`,
        headers: {
          'Content-Type': 'application/json',
          Partner: 'wallbox',
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.error(`[${fileName}] Error checking email ${err.message}`);
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] Check email response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error checking email`, err);
    }
  }

  async signin(email, password) {
    this.platform.apiCount++;
    let b64encoded = Buffer.from(email + ':' + password, 'utf8').toString('base64');
    try {
      this.log.debug(`[${fileName}] Signing in, retrieving token`);
      let response = await axios({
        method: 'get',
        baseURL: userEndpoint,
        url: `/users/signin`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${b64encoded}`,
          Partner: 'wallbox',
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json',
        raxConfig: {
          retry: 5,
          noResponseRetries: 2,
          retryDelay: 100,
          httpMethodsToRetry: ['GET', 'PUT'],
          statusCodesToRetry: [
            [100, 199],
            [400, 400],
            [401, 401],
            [404, 404],
            [500, 599]
          ],
          backoffType: 'exponential',
          onRetryAttempt: (err) => {
            let cfg = rax.getConfig(err);
            this.log.warn(`[${fileName}] ${err.message} retrying signin , attempt #${cfg.currentRetryAttempt}`);
          }
        }
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error signing in and getting token ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] Signin response`, JSON.stringify(response.data, null, 2));

        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving token`, err);
    }
  }

  async refresh(refreshToken) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Refreshing token`);
      let response = await axios({
        method: 'get',
        baseURL: userEndpoint,
        url: `/users/refresh-token`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json',
        raxConfig: {
          retry: 4,
          noResponseRetries: 3,
          retryDelay: 100,
          httpMethodsToRetry: ['GET', 'PUT'],
          statusCodesToRetry: [
            [100, 199],
            [400, 400],
            [404, 404],
            [500, 599]
          ],
          backoffType: 'exponential',
          onRetryAttempt: (err) => {
            let cfg = rax.getConfig(err);
            this.log.warn(`[${fileName}] ${err.message} retrying refresh token, attempt #${cfg.currentRetryAttempt}`);
          }
        }
      }).catch((err) => {
        this.log.error(`[${fileName}] Error refreshing token ${err.message}`);
        this.platform.showAPIMessages && this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
          return err.response;
        } else {
          return err;
        }
      });
      if (response.code) {
        this.log.warn(`[${fileName}] No network`, response.code);
        return { status: false };
      }
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] Refresh token response`, JSON.stringify(response.data, null, 2));
      }
      return response;
    } catch (err) {
      this.log.error(`[${fileName}] Error refreshing token`, err);
    }
  }

  async getId(token, id) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving User ID`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/v4/users/${id}/id`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting ID ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get ID response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving ID \n${err}`);
    }
  }

  async getUser(token, userId) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving user info`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/v2/user/${userId}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting user ID ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get user response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving user ID \n${err}`);
    }
  }

  async getChargerGroups(token) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving charger groups`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/v3/chargers/groups`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting charger groups ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get charger groups data response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving charger groups \n${err}`);
    }
  }

  async getCharger(token, group_id) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving charger`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/perseus/organizations/${group_id}/chargers`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting charger ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get chargerData response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving charger \n${err}`);
    }
  }

  async getChargerStatus(token, chargerId) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving charger status`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/chargers/status/${chargerId}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json',
        raxConfig: {
          retry: 3,
          noResponseRetries: 2,
          retryDelay: 100,
          httpMethodsToRetry: ['GET', 'PUT'],
          statusCodesToRetry: [
            [100, 199],
            [400, 400],
            [404, 404],
            [500, 599]
          ],
          backoffType: 'exponential',
          onRetryAttempt: (err) => {
            let cfg = rax.getConfig(err);
            this.log.warn(`${err.message} retrying get status, attempt #${cfg.currentRetryAttempt}`);
          }
        }
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting charger status ${err.message}`);
        if (err.response) {
          if (err.response.status != 504) {
            this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
          }
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get charger status response`, JSON.stringify(response.data, null, 2));
        return response;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving charger status \n${err}`);
    }
  }

  async getChargerData(token, chargerId) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving charger data`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/v2/charger/${chargerId}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`Error getting charger data: ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
      });
      if (response.status == 200) {
        let chargerData = response.data.data.chargerData;
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] getChargerData response`, JSON.stringify(chargerData, null, 2));
        return chargerData;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving charger data`, err);
    }
  }

  async getChargerConfig(token, chargerId) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving charger config`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `/chargers/config/${chargerId}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting charger config ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get charger config response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving charger config \n${err}`);
    }
  }

  async getLastSession(token, chargerId) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Retrieving charger session`);
      let response = await axios({
        method: 'get',
        baseURL: endpoint,
        url: `v4/charger-last-sessions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,compress'
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error getting charger session ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] get charger session response`, JSON.stringify(response.data, null, 2));
        return response.data;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error retrieving charger session \n${err}`);
    }
  }

  async lock(token, chargerId, value) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Setting charger lock state for ${chargerId} to ${value}`);
      let response = await axios({
        method: 'put',
        baseURL: endpoint,
        url: `/v2/charger/${chargerId}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,br'
        },
        data: {
          locked: value
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error locking charger config: ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      this.platform.showAPIMessages && this.log.debug(`[${fileName}] put lock response status`, response.status);

      if (response.status == 200) {
        this.platform.showAPIMessages && this.log.debug(`[${fileName}] put lock response`, response.status);
        return response;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error setting lock state config \n${err}`);
    }
  }

  async setAmps(token, chargerId, value) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Setting amperage for ${chargerId} to ${value}`);
      let response = await axios({
        method: 'put',
        baseURL: endpoint,
        url: `/v2/charger/${chargerId}`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,br'
        },
        data: {
          maxChargingCurrent: value
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error setting amperage ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status && this.platform.showAPIMessages) {
        this.log.debug(`[${fileName}] put setAmps response status`, response.status);
      }
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(
            `[${fileName}] Put setAmps response {maxChargingCurrent: ${JSON.stringify(
              response.data.data.chargerData.maxChargingCurrent,
              null,
              2
            )}}`
          );

        return response;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error setting amperage \n${err}`);
    }
  }

  async remoteAction(token, chargerId, value) {
    this.platform.apiCount++;
    try {
      this.log.debug(`[${fileName}] Setting charging state for ${chargerId} to ${value}`);
      let action;
      switch (value) {
        case 'resume':
        case 'start':
          action = 1;
          break;
        case 'pause':
          action = 2;
          break;
      }
      let response = await axios({
        method: 'post',
        baseURL: endpoint,
        url: `/v3/chargers/${chargerId}/remote-action`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `${PluginName}/${PluginVersion}`,
          'Accept-Encoding': 'gzip,deflate,br'
        },
        data: {
          action: action
        },
        responseType: 'json'
      }).catch((err) => {
        this.log.debug(`[${fileName}] `, JSON.stringify(err, null, 2));
        this.log.error(`[${fileName}] Error with remote action ${err.message}`);
        if (err.response) {
          this.log.warn(`[${fileName}] `, JSON.stringify(err.response.data, null, 2));
        }
        return err.response;
      });
      if (response.status && this.platform.showAPIMessages) {
        this.log.debug(`[${fileName}] post remote action response status`, response.status);
      }
      if (response.status == 200) {
        this.platform.showAPIMessages &&
          this.log.debug(`[${fileName}] post remote action response`, JSON.stringify(response.data, null, 2));
        return response;
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error with remote action`, err);
    }
  }
}
module.exports = wallboxAPI;
