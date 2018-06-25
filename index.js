class Subscription {
    constructor(unsubscribe) {
        this._subscriptions = null;
        this.closed = false;
        if (unsubscribe){
            this._unsubscribe = unsubscribe ;
        }
    }
    add(teardown) {
        if (!teardown) {
            return new Subscription();
        }
        if (teardown === this){
            // 过滤自己， 比方说 interval 的 subscriber add 了 一个 action，
            // 然后 observable subscribe的时候 这个 subscriber 又会 add(this._subscribe()) => this._subscribe() 返回 这个 subscriberl
            return this;
        }
        const subscriptions = this._subscriptions || (this._subscriptions = []);
        subscriptions.push(teardown);
    }
    unsubscribe() {
        this.closed = true;
        var { _subscriptions, _unsubscribe } = this;

        if (_unsubscribe){
            _unsubscribe.call(this);
        }

        if (Array.isArray(_subscriptions)) {
            var i = -1;
            var len = _subscriptions.length;
            while (++i < len) {
                var sub = _subscriptions[i];
                sub.unsubscribe.call(sub);
            }
        }
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

            // 为什么这里要 add this ？ 传递上级 subscribe, 以便 unsubscribe 能找到 
            // 比方说 
            // var b = interval().pipe(tap(), multicast(new subject())) b.subscribe(xx) b.connect()
            // TapSubscriber { _subscriptions:[AsyncAction] }  会在 interval subscriber.add( action ) 
            //  ConnectableSubscriber{ _subscriptions: [TapSubscriber]}  会在 source.subscribe(Tapsbuscribe(ConnectableSubscriber)) 的时候添加


            // 正常 内部的 subscription unsubscribe 会 遍历 _subscription 然后执行 他们的 unsubscribe 
            // 这里为例  subscription => unsubscribe => ConnectableSubscriber =》 unsubscribe 会找到 TapSubscriber=> TapSubscriber=> 取消定时
            distinationOrNext.add(this);
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
    error(err) {
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
            // {
            //     next(){},
            //     error(){},
            //     complete(){},
            // }
            sink = observerOrNext;
        } else if (!observerOrNext && !error && !complete) {
            // empty observer
            sink = new Subscriber({
                next() { },
                error() { },
                complete() { },
            });
        } else {
            //  subscrive(next, error, complete)
            sink = new Subscriber(observerOrNext, error, complete);
        }
        if (operator) {
            operator.call(sink, this.source);
        } else {
            sink.add(
                this.source
                ? this._subscribe(sink)
                : this.trySubscribe(sink)
            )
        }
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
