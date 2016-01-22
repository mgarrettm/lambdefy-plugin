'use strict';

const BbPromise = require('bluebird');

class EndpointBuilder {

  constructor(options) {

    this._maxDepth = options.maxDepth;
    this._methods = options.methods;

    options.responseHeaders.sort();
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
        path += '/';
      }
      path += '{p' + depth.toString() + '}';
    }

    return BbPromise.resolve(endpoints);
  }

  _generateEndpoint(path, method) {

    let _this = this;

    return {
      path: path,
      method: method,
      authorizationType: 'none',
      apiKeyRequired: false,
      requestParameters: {},
      requestTemplates: {
        'application/json': `{
          "method": "$context.httpMethod",
          "body" : $input.json('$'),
          "headers": {
            #foreach($param in $input.params().header.keySet())
              "$param": "$util.escapeJavaScript($input.params().header.get($param))" #if($foreach.hasNext),#end
            #end
          },
          "query": {
            #foreach($param in $input.params().querystring.keySet())
              "$param": "$util.escapeJavaScript($input.params().querystring.get($param))" #if($foreach.hasNext),#end
            #end
          },
          "path": {
            #foreach($param in $input.params().path.keySet())
              "$param": "$util.escapeJavaScript($input.params().path.get($param))" #if($foreach.hasNext),#end
            #end
          },
          "responseHeaders": ${JSON.stringify(_this._responseHeaders)}
        }`
      },
      responses: _this._generateResponses()
    };
  }

  _generateResponses() {
    
    let _this = this;
    let responses = {};

    _this._statusCodes.forEach(function (code) {

      let key = code == 500 ? 'default' : '^' + code.toString() + '.*';

      responses[key] = {
        statusCode: code.toString(),
        responseTemplates: {
          'application/json': "#set($body = $input.path('$.errorMessage').substring(3))$body"
        },
        responseParameters: _this._responseParameters
      };
    });

    return responses;
  }

  _generateResponseParameters(responseHeaders) {

    let responseParameters = {};

    responseHeaders.sort().forEach(function (header, i) {
        responseParameters['method.response.header.' + header] = 'integration.response.body.stackTrace[' + i.toString() + ']';
    });

    return responseParameters;
  }
}

module.exports = EndpointBuilder;
