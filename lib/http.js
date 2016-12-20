/*
 * Copyright (c) 2011 Vinay Pulim <vinay@milewise.com>
 * MIT Licensed
 */

'use strict';

var url = require('url');
var req = require('request');
var debug = require('debug')('node-soap');
var EOL = require('os').EOL;

var VERSION = require('../package.json').version;

/**
 * A class representing the http client
 * @param {Object} [options] Options object. It allows the customization of
 * `request` module
 *
 * @constructor
 */
function HttpClient(options) {
  options = options || {};
  this._request = options.request || req;
}

/**
 * Build the HTTP request (method, uri, headers, ...)
 * @param {String} rurl The resource url
 * @param {Object|String} data The payload
 * @param {Object} exheaders Extra http headers
 * @param {Object} exoptions Extra options
 * @returns {Object} The http request object for the `request` module
 */
HttpClient.prototype.buildRequest = function (rurl, data, exheaders, exoptions) {
  var curl = url.parse(rurl);
  var secure = curl.protocol === 'https:';
  var host = curl.hostname;
  var port = parseInt(curl.port, 10);
  var path = [curl.pathname || '/', curl.search || '', curl.hash || ''].join('');
  var method = data ? 'POST' : 'GET';
  var headers = {
    'User-Agent': 'node-soap/' + VERSION,
    'Accept': 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'none',
    'Accept-Charset': 'utf-8',
    'Connection': 'close',
    'Host': host + (isNaN(port) ? '' : ':' + port)
  };
  var attr;
  var header;
  var mergeOptions = ['headers'];

  if (typeof data === 'string') {
    headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  exheaders = exheaders || {};
  for (attr in exheaders) {
    headers[attr] = exheaders[attr];
  }

  var options = {
    uri: curl,
    method: method,
    headers: headers,
    followAllRedirects: true
  };


  options.body = data;


  exoptions = exoptions || {};
  for (attr in exoptions) {
    if (mergeOptions.indexOf(attr) !== -1) {
      for (header in exoptions[attr]) {
        options[attr][header] = exoptions[attr][header];
      }
    } else {
      options[attr] = exoptions[attr];
    }
  }
  debug('Http request: %j', options);
  return options;
};

/**
 * Handle the http response
 * @param {Object} The req object
 * @param {Object} res The res object
 * @param {Object} body The http body
 * @param {Object} The parsed body
 */
HttpClient.prototype.handleResponse = function (req, res, body) {
  debug('Http response body: %j', body);
  if (typeof body === 'string') {
    // Remove any extra characters that appear before or after the SOAP
    // envelope.
    var match =
      body.replace(/<!--[\s\S]*?-->/, "").match(/(?:<\?[^?]*\?>[\s]*)?<([^:]*):Envelope([\S\s]*)<\/\1:Envelope>/i);
    if (match) {
      body = match[0];
    }
  }

  var rows = body.split(EOL);

  var adrStart, adrEnd, msgEnd;

  rows.forEach(function (row, i) {
    if (row.indexOf('element="itr:LogicalAddress"') !== -1) adrStart = i;
    if (!adrEnd && adrStart && row.indexOf('</wsdl:part>') !== -1) adrEnd = i;
    if (adrStart && adrEnd && !msgEnd && row.indexOf('</wsdl:message>') !== -1) msgEnd = i;
  });

  if (adrStart && adrEnd && msgEnd) {
    var a = rows.slice(0, adrStart);
    var b = rows.slice(adrEnd + 1, msgEnd);
    var c = rows.slice(adrStart, adrEnd + 1);
    var d = rows.slice(msgEnd);
    body = a.concat(b).concat(c).concat(d).join('');
  }

  return body;
};

HttpClient.prototype.request = function (rurl, data, callback, exheaders, exoptions) {
  var self = this;
  var options = self.buildRequest(rurl, data, exheaders, exoptions);
  var headers = options.headers;
  var req = self._request(options, function (err, res, body) {
    if (err) {
      return callback(err);
    }
    body = self.handleResponse(req, res, body);
    callback(null, res, body);
  });

  return req;
};

HttpClient.prototype.requestStream = function (rurl, data, exheaders, exoptions) {
  var self = this;
  var options = self.buildRequest(rurl, data, exheaders, exoptions);
  return self._request(options);
};

module.exports = HttpClient;
