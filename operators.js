var { Observable, Subscriber } = require('./')

function filter(fnc) {
    return function(source) {
        return source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new FilterSubscriber(subscriber, fnc));
            }
        })
    }
}

function map(fnc) {
    return function(source) {
        // sourc above observable
        return source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new MapSubscriber(subscriber, fnc));
            }
        })
    }
}

function tap(fnc) {
    return function(source) {
        // sourc above observable
        return source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new TapSubscriber(subscriber, fnc));
            }
        })
    }
}

class FilterSubscriber extends Subscriber {
    constructor(destination, fnc) {
        super(destination);
        this.fnc = fnc;
    }
    next(value) {
        if (this.fnc.call(null, value)) {
            this.destination.next(value)
        }
    }
}

class MapSubscriber extends Subscriber {
    constructor(destination, fnc) {
        super(destination);
        this.fnc = fnc;
    }
    next(value) {
        var result = this.fnc.call(null, value)
        this.destination.next(result);
    }
}

class TapSubscriber extends Subscriber {
    constructor(destination, fnc) {
        super(destination);
        this.fnc = fnc;
    }
    next(value) {
        var result = this.fnc.call(null, value)
        this.destination.next(value);
    }
}

function from(input) {
    if (input instanceof Observable) {
        return input;
    }

    if (input.then && input.catch) {
        return new Observable((subscriber) => {
            input
                .then(value => {
                    subscriber.next(value),
                        subscriber.complete();
                })
                .catch(subscriber.error)
        })
    }

    if (input.length && input.slice && input.find) {
        return new Observable((subscriber) => {
            input.forEach(v => {
                subscriber.next(v)
            })
            subscriber.complete()
        })
    }
}

function defer(observableFactory) {
    return new Observable(subscriber => {
        var input = observableFactory()
        var source = input ? from(input) : {
            next() {},
            error() {},
            complete() {}
        }
        return source.subscribe(subscriber)
    })
}


// defer(() => Observable.create(subscriber => {
//         subscriber.next(1)
//         subscriber.next(3)
//         subscriber.complete()
//     }))
    from([1,2,3,4])
    .pipe(
        tap(x => {}),
        // filter(x => x > 2),
        // map(x => x + 1)
    )
    .toPromise()
    .then(console.log)
    .catch(console.log)