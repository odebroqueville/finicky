var finickyConfigApi = (function (exports) {
    'use strict';

    /* finicky config api 1.0.0 */

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function isDefined(value) {
        return typeof value !== "undefined";
    }
    function formatValue(value) {
        if (value instanceof RegExp) {
            return value.toString();
        }
        else if (Array.isArray(value)) {
            return "[Array]";
        }
        else if (typeof value === "function") {
            return "[Function" + (value.name ? " " + value.name : "") + "]";
        }
        else if (value instanceof Date) {
            return "[Date]";
        }
        else if (value === null) {
            return "[null]";
        }
        else if (value === undefined) {
            return "[undefined]";
        }
        return "[" + JSON.stringify(value, null, 2) + "]";
    }
    function getKeys(object) {
        return Object.keys(object).filter(function (key) { return Object.prototype.hasOwnProperty.call(object, key); });
    }
    function enumerate(names, mode) {
        if (mode === void 0) { mode = "or"; }
        if (names.length === 0) {
            return "";
        }
        if (names.length == 1) {
            return names[0];
        }
        var _a = names.reverse(), tail = _a[0], body = _a.slice(1);
        return body.join(", ") + " " + mode + " " + tail;
    }

    function getTypeName(typeName) {
        if (typeof typeName === "string") {
            return typeName;
        }
        return JSON.stringify(typeName, null, 2);
    }
    function createValidator(typeName, typeCallback) {
        function isOptional(value, key) {
            if (!isDefined(value)) {
                return undefined;
            }
            var result = typeCallback(value, key);
            if (typeof result === "boolean" && !result) {
                return "Value at " + key + ": " + formatValue(value) + " is not " + getTypeName(typeName);
            }
            else if (Array.isArray(result) && result.length > 0) {
                return result.join("\n");
            }
        }
        function isRequired(value, key) {
            if (!isDefined(value)) {
                return "Expected \"" + key + "\" to be " + getTypeName(typeName);
            }
            return isOptional(value, key);
        }
        isRequired.typeName = typeName;
        function checkType(value, key) {
            return isOptional(value, key);
        }
        checkType.isRequired = isRequired;
        // Save typeName for nice error messages
        checkType.typeName = typeName;
        return checkType;
    }

    function getErrors(object, schema, prefix) {
        if (prefix === void 0) { prefix = "root."; }
        // If schema is a function we're testing a single validator
        if (typeof schema === "function") {
            var result = schema(object, prefix + "value");
            return result ? [result] : [];
        }
        else if (typeof schema !== "object") {
            return [
                "Expected an schema that was an object or a function, but received " + typeof object + " (path: " + prefix + ")"
            ];
        }
        var schemaKeys = getKeys(schema);
        var errors = [];
        if (typeof object !== "object" || object === null) {
            errors.push("Expected an object to validate, but received " + typeof object + " (path: " + prefix + ")");
        }
        else {
            // Validate each property in schema
            schemaKeys.forEach(function (key) {
                var propChecker = schema[key];
                var result;
                if (typeof propChecker === "function") {
                    result = propChecker(object[key], prefix + key);
                }
                else if (["string", "number"].includes(typeof propChecker)) {
                    result = validate.value(propChecker)(object[key], prefix + key);
                }
                else {
                    result = "Expected a validator at path " + (prefix + key);
                }
                if (typeof result === "string") {
                    errors.push(result);
                }
            });
            // Check for extraneous properties in object
            getKeys(object).forEach(function (key) {
                if (!schemaKeys.includes(key)) {
                    errors.push("unknown key " + key + " at " + (prefix + key));
                }
            });
        }
        return errors;
    }
    var validate = {
        boolean: createValidator("boolean", function (value) { return typeof value === "boolean"; }),
        string: createValidator("string", function (value) { return typeof value === "string"; }),
        number: createValidator("number", function (value) { return typeof value === "number" && !Number.isNaN(value); }),
        function: function (argNames) {
            if (!Array.isArray(argNames)) {
                if (argNames) {
                    argNames = [argNames];
                }
                else {
                    argNames = [];
                }
            }
            var name = "function(" + argNames.join(", ") + ")";
            return createValidator(name, function (value) { return typeof value === "function"; });
        },
        regex: createValidator("regex", function (value) { return value instanceof RegExp; }),
        value: function (expectedValue) {
            return createValidator(expectedValue, function (value) {
                return value === expectedValue;
            });
        },
        shape: function (schema) {
            var names = getNameType(schema);
            return createValidator(names, function (value, key) {
                if (typeof value !== "object" || value === null) {
                    return false;
                }
                return getErrors(value, schema, key + ".");
            });
        },
        arrayOf: function (validator) {
            return createValidator("array", function (value, key) {
                if (!Array.isArray(value)) {
                    return false;
                }
                return value.reduce(function (errors, item, index) {
                    var result = validator(item, key + "[" + index + "]");
                    if (typeof result === "string") {
                        return errors.concat([result]);
                    }
                    return errors;
                }, []);
            });
        },
        oneOf: function (OneOfs) {
            var typeCheckers = OneOfs.map(function (v) {
                if (["string", "number"].includes(typeof v)) {
                    return validate.value(v);
                }
                return v;
            });
            var description = enumerate(typeCheckers.map(function (oneOf) { return getTypeName(oneOf.typeName); }));
            return createValidator("" + description, function (value, key) {
                var errors = typeCheckers.every(function (oneOfValidator) { return typeof oneOfValidator(value, key) === "string"; });
                return errors ? [key + ": Value not one of " + description] : true;
            });
        }
    };
    function getNameType(schema) {
        var names = {};
        var schemaKeys = getKeys(schema);
        schemaKeys.forEach(function (key) {
            var property = schema[key];
            if (typeof property === "number" || typeof property === "string") {
                names[key] = typeof property;
            }
            else {
                names[key] = property.typeName;
            }
        });
        return names;
    }

    var urlSchema = {
        url: validate.oneOf([
            validate.string,
            validate.shape({
                protocol: validate.oneOf(["http", "https"]).isRequired,
                username: validate.string,
                password: validate.string,
                host: validate.string.isRequired,
                port: validate.oneOf([validate.number, validate.value(null)]),
                pathname: validate.string,
                search: validate.string,
                hash: validate.string
            })
        ]).isRequired
    };
    var browserSchema = validate.oneOf([
        validate.string,
        validate.shape({
            name: validate.string.isRequired,
            appType: validate.oneOf(["appName", "bundleId"]),
            openInBackground: validate.boolean
        }),
        validate.function("options"),
        validate.value(null)
    ]);
    var multipleBrowsersSchema = validate.oneOf([
        browserSchema,
        validate.arrayOf(browserSchema.isRequired)
    ]);
    var matchSchema = validate.oneOf([
        validate.string,
        validate.function("options"),
        validate.regex,
        validate.arrayOf(validate.oneOf([
            validate.string,
            validate.function("options"),
            validate.regex
        ]))
    ]);
    var finickyConfigSchema = {
        defaultBrowser: multipleBrowsersSchema.isRequired,
        options: validate.shape({
            hideIcon: validate.boolean,
            urlShorteners: validate.arrayOf(validate.string)
        }),
        rewrite: validate.arrayOf(validate.shape({
            match: matchSchema.isRequired,
            url: validate.oneOf([validate.string, validate.function("options")])
                .isRequired
        }).isRequired),
        handlers: validate.arrayOf(validate.shape({
            match: matchSchema.isRequired,
            browser: multipleBrowsersSchema.isRequired
        }))
    };

    var appDescriptorSchema = {
        name: validate.string,
        appType: validate.oneOf([
            validate.value("bundleId"),
            validate.value("appName"),
            validate.value("none")
        ]).isRequired,
        openInBackground: validate.boolean
    };
    function processUrl(options) {
        var config = module && module.exports;
        if (!config) {
            return processBrowserResult("Safari", options);
        }
        options = rewriteUrl(config, options);
        if (Array.isArray(config.handlers)) {
            for (var _i = 0, _a = config.handlers; _i < _a.length; _i++) {
                var handler = _a[_i];
                if (isMatch(handler.match, options)) {
                    return processBrowserResult(handler.browser, options);
                }
            }
        }
        return processBrowserResult(config.defaultBrowser, options);
    }
    function validateSchema(value, schema, path) {
        if (path === void 0) { path = ""; }
        var errors = getErrors(value, schema, path);
        if (errors.length > 0) {
            throw new Error(errors.join("\n") + "\nReceived value: " + JSON.stringify(value, null, 2));
        }
    }
    function createUrl(url) {
        var protocol = url.protocol, host = url.host, _a = url.pathname, pathname = _a === void 0 ? "" : _a;
        var port = url.port ? ":" + url.port : "";
        var search = url.search ? "?" + url.search : "";
        var hash = url.hash ? "#" + url.hash : "";
        var auth = url.username ? "" + url.username : "";
        auth += url.password ? ":" + url.password : "";
        return protocol + "://" + auth + host + port + pathname + search + hash;
    }
    function rewriteUrl(config, options) {
        if (Array.isArray(config.rewrite)) {
            for (var _i = 0, _a = config.rewrite; _i < _a.length; _i++) {
                var rewrite = _a[_i];
                if (isMatch(rewrite.match, options)) {
                    var urlResult = resolveFn(rewrite.url, options);
                    validateSchema({ url: urlResult }, urlSchema);
                    if (typeof urlResult === "string") {
                        options = __assign({}, options, { url: finicky.getUrlParts(urlResult), urlString: urlResult });
                    }
                    else {
                        options = __assign({}, options, { url: urlResult, urlString: createUrl(urlResult) });
                    }
                }
            }
        }
        return options;
    }
    function isMatch(matcher, options) {
        if (!matcher) {
            return false;
        }
        var matchers = Array.isArray(matcher) ? matcher : [matcher];
        return matchers.some(function (matcher) {
            if (matcher instanceof RegExp) {
                return matcher.test(options.urlString);
            }
            else if (typeof matcher === "string") {
                return matcher === options.urlString;
            }
            else if (typeof matcher === "function") {
                return !!matcher(options);
            }
            return false;
        });
    }
    // Recursively resolve handler to value
    function resolveFn(result, options) {
        if (typeof result === "function") {
            return result(options);
        }
        return result;
    }
    function getAppType(value) {
        if (value === null) {
            return "none";
        }
        return looksLikeBundleIdentifier(value) ? "bundleId" : "appName";
    }
    function processBrowserResult(result, options) {
        var browser = resolveFn(result, options);
        if (!Array.isArray(browser)) {
            browser = [browser];
        }
        var browsers = browser.map(createBrowser);
        return { browsers: browsers, url: options.urlString };
    }
    function createBrowser(browser) {
        // If all we got was a string, try to figure out if it's a bundle identifier or an application name
        if (typeof browser === "string" || browser === null) {
            browser = {
                name: browser
            };
        }
        if (typeof browser === "object" && !browser.appType) {
            var name_1 = browser.name === null ? "" : browser.name;
            browser = __assign({}, browser, { name: name_1, appType: getAppType(browser.name) });
        }
        validateSchema(browser, appDescriptorSchema);
        return browser;
    }
    function looksLikeBundleIdentifier(value) {
        // Regular expression to match Uniform Type Identifiers
        // Adapted from https://stackoverflow.com/a/34241710/1698327
        var bundleIdRegex = /^[A-Za-z]{2,6}((?!-)\.[A-Za-z0-9-]{1,63})+$/;
        if (bundleIdRegex.test(value)) {
            return true;
        }
        return false;
    }

    function validateConfig() {
        if (!module) {
            throw new Error("module is not defined");
        }
        if (!module.exports) {
            throw new Error("module.exports is not defined");
        }
        var invalid = getErrors(module.exports, finickyConfigSchema, "module.exports.");
        if (invalid.length === 0) {
            return true;
        }
        throw new Error(invalid.join("\n"));
    }

    exports.processUrl = processUrl;
    exports.validateConfig = validateConfig;

    return exports;

}({}));
