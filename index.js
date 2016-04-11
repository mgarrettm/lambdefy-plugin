'use strict';

module.exports = function(S) {
  const path = require('path'),
      SUtils    = S.utils,
      SError    = require(S.getServerlessPath('Error')),
      BbPromise = require('bluebird'),
      _         = require('lodash');

  class Lambdefy extends S.classes.Plugin {

    constructor() {
      super();
      this.name = 'lambdefy';
    }

    registerActions() {
      S.addAction(this.lambdefy.bind(this), {
        handler:       'lambdefy',
        description:   'Generate endpoints for a lambdefy application',
        context:       'function',
        contextAction: 'lambdefy',
        options:       [],
        parameters: [
          {
            parameter: 'name',
            description: 'Name of the function containing your application',
            position: '0'
          }
        ]
      });

      return BbPromise.resolve();
    }

    lambdefy(evt) {
      this.evt = evt;

      return this._validateAndPrepare()
        .bind(this)
        .then(this._buildEndpoints)
        .then(() => this.function.save())
        .then(() => this.evt);
    }

    _validateAndPrepare() {
      if (S.cli && !this.evt.options.name) {

        if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
          throw new SError(`You must be in a function folder to run this command`);
        }

        this.evt.options.name = SUtils.readFileSync(path.join(process.cwd(), 's-function.json')).name;
      }

      if (!S.cli && !this.evt.options.name) throw new SError(`Please provide a function name as a parameter`);

      this.function = S.getProject().getFunction(this.evt.options.name);

      let defaults = {
        maxDepth: 0,
        methods: [],
        responseHeaders: [],
        statusCodes: [
          500
        ]
      };

      this.function.custom.lambdefy = _.merge(defaults, this.function.custom.lambdefy);

      return BbPromise.resolve();
    }

    _buildEndpoints(evt) {
      this.function.endpoints = []

      let responseParameters = {};

      this.function.custom.lambdefy.responseHeaders.sort().forEach((header, i) => {
          responseParameters['method.response.header.' + header] = 'integration.response.body.stackTrace[' + i.toString() + ']';
      });

      let apiPath = '/';

      for (let depth = 0; depth <= this.function.custom.lambdefy.maxDepth; depth++) {
        this.function.custom.lambdefy.methods.forEach(method => {
          let data = {
            path: apiPath,
            method: method,
            type: 'AWS',
            authorizationType: 'none',
            authorizerFunction: false,
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
                "responseHeaders": ${JSON.stringify(this.function.custom.lambdefy.responseHeaders)}
              }`
            },
            responses: this._buildResponses(responseParameters)
          };

          this.function.setEndpoint(new S.classes.Endpoint(data, this.function));
        });

        if (depth) {
          apiPath += '/';
        }
        apiPath += '{p' + depth.toString() + '}';
      }
    }

    _buildResponses(responseParameters) {
      let responses = {};

      this.function.custom.lambdefy.statusCodes.forEach(code => {
        let key = code == 500 ? 'default' : '^' + code.toString() + '.*';

        responses[key] = {
          statusCode: code.toString(),
          responseTemplates: {
            'application/json': "#set($body = $util.base64Decode($input.path('$.errorMessage').substring(3)))$body"
          },
          responseParameters: responseParameters
        };
      });

      return responses;
    }
  }

  return Lambdefy;
};
