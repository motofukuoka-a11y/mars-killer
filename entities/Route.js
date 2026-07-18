/**
 * Route
 */

export default class Route {

    constructor(){

        this.segments = [];

        this.salesDistance = 0;

        this.convertDistance = 0;

    }

    addSegment(segment){

        this.segments.push(segment);

        this.salesDistance += segment.salesDistance;

        this.convertDistance += segment.convertDistance;

    }

}