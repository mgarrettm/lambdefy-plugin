'use strict';

module.exports = function(ServerlessPlugin, serverlessPath) {

  const BbPromise = require('bluebird'),
      EndpointBuilder = require('./EndpointBuilder'),
      path            = require('path'),
      fs              = require('fs'),
      util            = require('util'),
      SUtils          = require(path.join(serverlessPath, 'utils'));

  BbPromise.promisifyAll(fs);

  class LambdefyPlugin extends ServerlessPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'com.serverless.' + LambdefyPlugin.name;
    }

    registerActions() {

      this.S.addAction(this._init.bind(this), {
        handler:       'lambdefyInit',
        description:   'Initialize a lambdefy application',
        context:       'lambdefy',
        contextAction: 'init',
        options:       []
      });

      this.S.addAction(this._generate.bind(this), {
        handler:       'lambdefyGenerate',
        description:   'Generate endpoints for a lambdefy application',
        context:       'lambdefy',
        contextAction: 'generate',
        options:       []
      });

      return BbPromise.resolve();
    }

    _init(evt) {

      let _this = this;

      evt = {};

      return BbPromise.resolve(evt);
    }

    _generate(evt) {

      let _this = this;

      evt = {};

      return _this._getApplication(evt)
        .bind(_this)
        .then(_this._gatherInputsAndDefaults)
        .then(_this._coalesceMaxDepth)
        .then(_this._coalesceMethods)
        .then(_this._coalesceRequestHeaders)
        .then(_this._coalesceResponseHeaders)
        .then(_this._coalesceStatusCodes)
        .then(_this._generateEndpoints)
        .then(_this._saveEndpoints);
    }

    _getApplication(evt) {

      let _this = this;

      return SUtils.getFunctions(_this.S._projectRootPath, null)
        .then(function (functions) {
          functions.forEach(function (func) {
            if ("lambdefy" in func.custom) {
              if (evt.application) {
                throw new Error("only one function in a project can contain a lambdefy attribute");
              } else {
                evt.application = func;
              }
            }
          });

          if (!evt.application) {
            throw new Error("no functions in this project contain lambdefy attribute");
          }

          return evt;
        });
    }

    _gatherInputsAndDefaults(evt) {

      evt.options = {};
      evt.defaults = {
        "maxDepth": 0,
        "methods": [
          "GET"
        ],
        "requestHeaders": [],
        "responseHeaders": [
          "Connection",
          "Content-Length",
          "Content-Type",
          "Date",
          "ETag"
        ],
        "statusCodes": [
          200,
          404,
          500
        ]
      };
      evt.inputs = evt.application.custom.lambdefy;

      return BbPromise.resolve(evt);
    }

    _coalesceMaxDepth(evt) {

      if ("maxDepth" in evt.inputs) {
        if (isNaN(evt.inputs.maxDepth) || evt.inputs.maxDepth < 0 || evt.inputs.maxDepth % 1 != 0) {
          throw new Error(util.format("invalid value for maxDepth: %s; must be a nonnegative integer", evt.inputs.maxDepth.toString()));
        }
        evt.options.maxDepth = evt.inputs.maxDepth;
      } else {
        evt.options.maxDepth = evt.defaults.maxDepth;
      }

      return BbPromise.resolve(evt);
    }

    _coalesceMethods(evt) {

      if (evt.inputs.defaultMethods !== false) {
        evt.options.methods = evt.defaults.methods;
      } else {
        evt.options.methods = [];
      }

      if ("methods" in evt.inputs) {
        if (!Array.isArray(evt.inputs.methods)) {
          throw new Error("methods property must be an array");
        }

        const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

        evt.inputs.methods.forEach(function (item) {
          if (validMethods.indexOf(item) == -1) {
            throw new Error(util.format("invalid method %s; supported values are " + validMethods.join(", ")), item);
          }

          if (evt.options.methods.indexOf(item) == -1) {
            evt.options.methods.push(item);
          }
        });
      }

      if (!evt.options.methods.length) {
        throw new Error("if default methods are not used, methods must be provided in the methods attribute");
      }

      return BbPromise.resolve(evt);
    }

    _coalesceRequestHeaders(evt) {

      if (evt.inputs.defaultRequestHeaders !== false) {
        evt.options.requestHeaders = evt.defaults.requestHeaders;
      } else {
        evt.options.requestHeaders = [];
      }

      if ("requestHeaders" in evt.inputs) {
        if (!Array.isArray(evt.inputs.requestHeaders)) {
          throw new Error("requestHeaders property must be an array");
        }

        evt.inputs.requestHeaders.forEach(function (header) {
          if (evt.options.requestHeaders.indexOf(header) == -1) {
            evt.options.requestHeaders.push(header);
          }
        });
      }

      return BbPromise.resolve(evt);
    }

    _coalesceResponseHeaders(evt) {

      if (evt.inputs.defaultResponseHeaders !== false) {
        evt.options.responseHeaders = evt.defaults.responseHeaders;
      } else {
        evt.options.responseHeaders = [];
      }

      if ("responseHeaders" in evt.inputs) {
        if (!Array.isArray(evt.inputs.responseHeaders)) {
          throw new Error("responseHeaders property must be an array");
        }

        evt.inputs.responseHeaders.forEach(function (header) {
          if (evt.options.responseHeaders.indexOf(header) == -1) {
            evt.options.responseHeaders.push(header);
          }
        });
      }

      return BbPromise.resolve(evt);
    }

    _coalesceStatusCodes(evt) {

      if (evt.inputs.defaultStatusCodes !== false) {
        evt.options.statusCodes = evt.defaults.statusCodes;
      } else {
        evt.options.statusCodes = [];
      }

      let successCode = evt.options.statusCodes.length > 0;

      if ("statusCodes" in evt.inputs) {
        if (!Array.isArray(evt.inputs.statusCodes)) {
          throw new Error("statusCodes property must be an array");
        }

        evt.inputs.statusCodes.forEach(function (code) {
          if (code < 200) {
            throw new Error("status codes below 200 are not supported");
          }

          if (code < 300) {
            if (successCode) {
              throw new Error("only one 2XX status code is allowed in an app");
            } else {
              successCode = true;
            }
          }

          if (code > 599) {
            throw new Error("status codes above 599 are not supported");
          }

          if (evt.options.statusCodes.indexOf(code) == -1) {
            evt.options.statusCodes.push(code);
          }
        });
      }

      if (!evt.options.statusCodes.length) {
        throw new Error("if default status codes are not used, status codes must be provded in the statusCodes attribute");
      }

      if (!successCode) {
        throw new Error("a single 2XX status code is required");
      }

      return BbPromise.resolve(evt);
    }

    _generateEndpoints(evt) {

      new EndpointBuilder(evt.options)
        .generateEndpoints()
        .then(function (endpoints) {
          evt.endpoints = endpoints;
        });

      return BbPromise.resolve(evt);
    }

    _saveEndpoints(evt) {

      let _this = this;

      let sFunctionPath = path.join(_this.S._projectRootPath, evt.application.pathFunction, "s-function.json");
      let sFunction = require(sFunctionPath);
      sFunction.functions[evt.application.name].endpoints = evt.endpoints;
      
      return fs.writeFileSync(sFunctionPath, JSON.stringify(sFunction, null, "  "));
    }
  }

  return LambdefyPlugin;
};
