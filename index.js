class Subscription {
    constructor(unsubscribe) {
        this._parent = null;
        this._subscriptions = null;
        this._unsubscribe = unsubscribe ? unsubscribe : null;
    }
    add(teardown) {
        // const subscriptions = this._subscriptions || (this._subscriptions = []);
        // subscriptions.push(teardown)
        // teardown._parent = this;
    }
    unsubscribe() { 
        
    }
}

class Subscriber extends Subscription {
    static create(next, error, complete) {
        const subscriber = new Subscriber(next, error, complete)
        return subscriber;
    }
    constructor(distinationOrNext, error, complete) {
        super();
        this.isStopped = false;
        if (distinationOrNext instanceof Subscriber) {
            this.destination = distinationOrNext;
        }
        //{
        //  next(){},
        //  error(){},
        //  complete()
        //}
        if (typeof distinationOrNext === 'object') {
            this.destination = {
                next(value) {
                    distinationOrNext.next
                        ? distinationOrNext.next(value)
                        : distinationOrNext(value);
                },
                error(err) {
                    distinationOrNext.error(err)
                },
                complete() {
                    distinationOrNext.complete()
                }
            }
        }

        // {function(){}, function(){}, function(){}}
        if (typeof distinationOrNext === 'function') {
            this.destination = {
                next(value) {
                    distinationOrNext(value);
                },
                error(err) {
                    error(error);
                },
                complete() {
                    complete(error);
                }
            }
        }

        // empty subscriber
        if (!distinationOrNext) {
            this.destination = {
                next() { },
                error() { },
                complete() { },
            }
        }
    }
    next(value) {
        if (!this.isStopped)
            this.destination.next(value);
    }
    error(error) {
        if (!this.isStopped) {
            this.destination.error(err);
            this.unsubscribe();
        }
    }
    complete() {
        if (!this.isStopped) {
            this.isStopped = true
            this.destination.complete()
            this.unsubscribe();
        }
    }
    unsubscribe() {
        if (this.closed) {
            return;
        }
        this.isStopped = true;
        super.unsubscribe();
    }

}

class Observable {

    constructor(subscribe) {
        if (subscribe) {
            this._subscribe = subscribe;
        }
    }

    static create(subscribe) {
        return new Observable(subscribe)
    }

    lift(operator) {
        var observable = new Observable();
        observable.source = this;
        observable.operator = operator;
        return observable;
    }

    subscribe(observerOrNext, error, complete) {
        var sink;
        var { operator } = this;

        if (observerOrNext && (observerOrNext instanceof Subscriber)) {
            sink = observerOrNext;
        }

        if (!observerOrNext && !error && !complete) {
            sink = new Subscriber({
                next() { },
                error() { },
                complete() { },
            });
        }

        sink = new Subscriber(observerOrNext, error, complete);

        if (operator) {
            operator.call(sink, this.source);
        }
        // sink.add(
        //     this.source ?
        //         this.source :
        // this.trySubscribe(sink)
        // )
        this.source ? this.source : this.trySubscribe(sink)

        return sink;
    }

    trySubscribe(sink) {
        return this._subscribe(sink);
    }

    pipe(...operations) {
        // pipe ()
        if (operations.length === 0) {
            return this;
        }
        // pipe ( map(x => x+ 1))
        if (operations.length === 1) {
            return operations[0](this)
        }
        // pipe(
        //  map()
        // take(),
        //)
        return (function (input) {
            return operations.reduce((prev, fn) => {
                return fn(prev)
            }, input);
        })(this)
    }

    toPromise() {
        return new Promise((resolve, reject) => {
            var value;
            this.subscribe(
                (x) => value = x,
                (err) => reject(err),
                () => resolve(value),
            )
        })
    }
}

exports.Subscriber = Subscriber;
exports.Observable = Observable;
exports.Subscription = Subscription;
