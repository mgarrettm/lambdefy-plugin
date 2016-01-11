'use strict';

const BbPromise = require('bluebird');

class EndpointBuilder {

  constructor(options) {

    options.responseHeaders.sort();

    this._maxDepth = options.maxDepth;
    this._methods = options.methods;
    this._requestParameters = this._generateRequestParameters(options.requestHeaders);
    this._responseParameters = this._generateResponseParameters(options.responseHeaders);
    this._responseHeaders = options.responseHeaders.map(function (header) {
        return header.toLowerCase();
    });
    this._statusCodes = options.statusCodes;
    this._statusCodes.push(500);
  }

  generateEndpoints() {

    let _this = this;
    let endpoints = [];
    let path = "/";

    for (let depth = 0; depth <= _this._maxDepth; depth++) {
      _this._methods.forEach(function (method) {
        endpoints.push(_this._generateEndpoint(path, method));
      });

      if (depth) {
        path += "/";
      }
      path += "{p" + depth.toString() + "}";
    }

    return BbPromise.resolve(endpoints);
  }

  _generateEndpoint(path, method) {

    let _this = this;

    return {
      path: path,
      method: method,
      authorizationType: "none",
      apiKeyRequired: false,
      requestParameters: _this._requestParameters,
      requestTemplates: {
        "application/json": JSON.stringify({
          path: "$input.params().path",
          query: "$input.params().querystring",
          headers: "$input.params().header",
          body: "$input.json('$')",
          method: "$context.httpMethod",
          responseHeaders: _this._responseHeaders
        })
      },
      responses: _this._generateResponses()
    };
  }

  _generateResponses() {
    
    let _this = this;
    let responses = {};

    _this._statusCodes.forEach(function (code) {

      let key = code == 500 ? 'default' : code.toString();

      responses[key] = {
        statusCode: code.toString(),
        responseTemplates: {
          'application/json': "$util.base64Decode($input.path('$.stackTrace[0]'))"
        },
        responseParameters: _this._responseParameters
      };
    });

    return responses;
  }

  _generateRequestParameters(requestHeaders) {

    let requestParameters = {};

    requestHeaders.forEach(function (header) {
      requestParameters["integration.request.header." + header] = "method.request.header." + header;
    });

    return requestParameters;
  }

  _generateResponseParameters(responseHeaders) {

    let responseParameters = {};

    responseHeaders.sort().forEach(function (header, i) {
        responseParameters["method.response.header." + header] = "integration.response.body.stackTrace[" + (i + 1).toString() + "]";
    });

    return responseParameters;
  }
}

module.exports = EndpointBuilder;
