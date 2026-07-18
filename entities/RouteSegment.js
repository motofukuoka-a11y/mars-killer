/**
 * RouteSegment
 */

export default class RouteSegment {

    constructor({

        from,

        to,

        salesDistance,

        convertDistance,

        line

    }){

        this.from = from;

        this.to = to;

        this.salesDistance = salesDistance;

        this.convertDistance = convertDistance;

        this.line = line;

    }

}