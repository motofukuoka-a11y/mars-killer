export default class Ticket {

    constructor({

        type,

        price,

        departureTime,

        beforeDeparture=true,

        daysBefore=999

    }){

        this.type = type;

        this.price = price;

        this.departureTime = departureTime;

        this.beforeDeparture = beforeDeparture;

        this.daysBefore = daysBefore;

    }

}