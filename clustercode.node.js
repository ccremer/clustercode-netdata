"use strict";

// example configuration in netdata/conf.d/node.d/clustercode.conf.md

var url = require("url");
var http = require("http");
var netdata = require("netdata");

netdata.debug("loaded " + __filename + " plugin");

var clustercode = {
    name: "Clustercode",
    enable_autodetect: false,
    update_every: 3,
    base_priority: 60100,
    charts: {},

    bitrateId: "bitrate",
    fpsId: "fps",
    percentageId: "percentage",

    createBasicDimension: function (id, name, divisor) {
        return {
            id: id,                                     // the unique id of the dimension
            name: name,                                 // the name of the dimension
            algorithm: netdata.chartAlgorithms.absolute,// the id of the netdata algorithm
            multiplier: 1,                              // the multiplier
            divisor: divisor,                           // the divisor
            hidden: false                               // is hidden (boolean)
        };
    },

    getPercentageChart: function (service, suffix) {
        var id = this.getChartId(service, suffix);
        var chart = clustercode.charts[id];
        if (clustercode.isDefined(chart)) return chart;
        var dim = {};
        dim[clustercode.percentageId] = this.createBasicDimension(clustercode.percentageId, "percentage", 100);

        chart = {
            id: id,                                         // the unique id of the chart
            name: "",                                       // the unique name of the chart
            title: service.name + " Current Progress",      // the title of the chart
            units: "%",                                     // the units of the chart dimensions
            family: "progress",                             // the family of the chart
            context: "clustercode.progress.percentage",                    // the context of the chart
            type: netdata.chartTypes.area,                  // the type of the chart
            priority: clustercode.base_priority + 1,            // the priority relative to others in the same family
            update_every: service.update_every,             // the expected update frequency of the chart
            dimensions: dim
        };
        chart = service.chart(id, chart);
        clustercode.charts[id] = chart;

        return chart;
    },

    getFpsChart: function (service, suffix) {
        var id = this.getChartId(service, suffix);
        var chart = clustercode.charts[id];
        if (clustercode.isDefined(chart)) return chart;
        var dim = {};
        dim[clustercode.fpsId] = this.createBasicDimension(clustercode.fpsId, "fps", 100);

        chart = {
            id: id,                                         // the unique id of the chart
            name: "",                                       // the unique name of the chart
            title: service.name + " Current frames per second",          // the title of the chart
            units: "fps",                                     // the units of the chart dimensions
            family: "progress",                          // the family of the chart
            context: "clustercode.progress.fps",                 // the context of the chart
            type: netdata.chartTypes.area,                  // the type of the chart
            priority: clustercode.base_priority + 2,            // the priority relative to others in the same family
            update_every: service.update_every,             // the expected update frequency of the chart
            dimensions: dim
        };
        chart = service.chart(id, chart);
        clustercode.charts[id] = chart;

        return chart;
    },

    getBitrateChart: function (service, suffix) {
        var id = this.getChartId(service, suffix);
        var chart = clustercode.charts[id];
        if (clustercode.isDefined(chart)) return chart;

        var dim = {};
        dim[clustercode.bitrateId] = this.createBasicDimension(clustercode.bitrateId, "bitrate", 100);

        chart = {
            id: id,                                         // the unique id of the chart
            name: "",                                       // the unique name of the chart
            title: service.name + " Current bitrate",    // the title of the chart
            units: "kbit/s",                                     // the units of the chart dimensions
            family: "progress",                                // the family of the chart
            context: "clustercode.progress.bitrate",                       // the context of the chart
            type: netdata.chartTypes.line,                  // the type of the chart
            priority: clustercode.base_priority + 3,            // the priority relative to others in the same family
            update_every: service.update_every,             // the expected update frequency of the chart
            dimensions: dim
        };
        chart = service.chart(id, chart);
        clustercode.charts[id] = chart;

        return chart;
    },

    processResponse: function (service, content) {
        var json = clustercode.convertToJson(content);
        if (json === null) return;

        // add the service
        service.commit();

        var chartDefinitions = clustercode.parseCharts(service, json);
        var chartCount = chartDefinitions.length;
        while (chartCount--) {
            var chartObj = chartDefinitions[chartCount];
            service.begin(chartObj.chart);
            var dimCount = chartObj.dimensions.length;
            while (dimCount--) {
                var dim = chartObj.dimensions[dimCount];
                service.set(dim.name, dim.value);
            }
            service.end();
        }
    },

    parseCharts: function (service, json) {
        return [
            this.parseBitrateChart(service, json),
            this.parseFpsChart(service, json),
            this.parsePercentageCharts(service, json)
        ];
    },

    parseBitrateChart: function (service, progress) {
        return this.getChart(this.getBitrateChart(service, "bitrate"),
            [
                this.getDimension(this.bitrateId, Math.round(Math.max(progress.bitrate, 0) * 100))
            ]
        );
    },

    parseFpsChart: function (service, progress) {
        return this.getChart(this.getFpsChart(service, "fps"),
            [
                this.getDimension(this.fpsId, Math.round(Math.max(progress.fps, 0) * 100))
            ]
        );
    },

    parsePercentageCharts: function (service, progress) {
        return this.getChart(this.getPercentageChart(service, "percentage"),
            [
                this.getDimension(this.percentageId, Math.round(Math.max(progress.percentage, 0) * 100))
            ]
        );
    },

    getDimension: function (name, value) {
        return {
            name: name,
            value: value
        };
    },

    getChart: function (chart, dimensions) {
        return {
            chart: chart,
            dimensions: dimensions
        };
    },

    getChartId: function (service, suffix) {
        return "clustercode_" + service.name + "." + suffix;
    },

    convertToJson: function (httpBody) {
        if (httpBody === null) return null;
        var json = httpBody;
        // can't parse if it's already a json object,
        // the check enables easier testing if the httpBody is already valid JSON.
        if (typeof httpBody !== "object") {
            try {
                json = JSON.parse(httpBody);
            } catch (error) {
                netdata.error("clustercode: Got a response, but it is not valid JSON. Ignoring. Error: " + error.message);
                return null;
            }
        }
        return this.isResponseValid(json) ? json : null;
    },

    // some basic validation
    isResponseValid: function (json) {
        if (this.isUndefined(json.bitrate)) return false;
        if (this.isUndefined(json.percentage)) return false;
        return this.isDefined(json.fps);
    },

    // module.serviceExecute()
    // this function is called only from this module
    // its purpose is to prepare the request and call
    // netdata.serviceExecute()
    serviceExecute: function (name, uri, update_every) {
        netdata.debug(this.name + ": " + name + ": url: " + uri + ", update_every: " + update_every);

        var service = netdata.service({
            name: name,
            request: netdata.requestFromURL("http://" + uri),
            update_every: update_every,
            module: this
        });
        service.execute(this.processResponse);
    },


    configure: function (config) {
        if (clustercode.isUndefined(config.nodes)) return 0;
        var added = 0;
        var len = config.nodes.length;
        while (len--) {
            var node = config.nodes[len];
            if (clustercode.isUndefined(node.update_every)) node.update_every = this.update_every;
            if (clustercode.areUndefined([node.name, node.hostname, node.progress_api])) continue;

            var url = node.hostname + node.progress_api;
            this.serviceExecute(node.name, url, node.update_every);
            added++;
        }
        return added;
    },

    // module.update()
    // this is called repeatedly to collect data, by calling
    // netdata.serviceExecute()
    update: function (service, callback) {
        service.execute(function (serv, data) {
            service.module.processResponse(serv, data);
            callback();
        });
    },

    isUndefined: function (value) {
        return typeof value === "undefined";
    },

    areUndefined: function (valueArray) {
        var i = 0;
        for (i; i < valueArray.length; i++) {
            if (this.isUndefined(valueArray[i])) return true;
        }
        return false;
    },

    isDefined: function (value) {
        return typeof value !== "undefined";
    }
};

module.exports = clustercode;
