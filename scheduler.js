var { Observable, Subscriber, Subscription } = require('./')


class AsyncScheduler {
    constructor(ScheduleAction) {
        this.ScheduleAction = ScheduleAction;
        this.scheduler = undefined;
    }

    schedule(work, delay, state) {
        return new this.ScheduleAction(this, work).schedule(state, delay);
    }

    flush(action) {
        var { actions } = this;
        action.execute(action.state, action.delay);
    }
}

class Asynction extends Subscription {
    constructor(scheduler, work) {
        super();
        this.scheduler = scheduler;
        this.work = work;
        this.state;
        this.delay;
        this.id;
    }

    schedule(state, delay) {
        this.state = state;
        var id = this.id;
        var scheduler = this.scheduler;
        if (id !== null) {
            this.id = clearInterval(id);
        }
        this.delay = delay;
        this.id = this.id || setInterval(scheduler.flush.bind(scheduler, this), delay);
        return this;
    }

    execute(state, delay) {
        this.work(state);
    }

    unsubscribe() {
        var id = this.id;
        this.work = null;
        this.state = null;
        this.scheduler = null;
        this.id = clearInterval(id);
        this.delay = null;
    }
}


const async = new AsyncScheduler(Asynction);

function interval(period = 0, scheduler = async) {
    return new Observable(subscriber => {
        scheduler.schedule(function dispatch(state) {
            var { subscriber, counter, period } = state;
            subscriber.next(counter);
            this.schedule({ subscriber, counter: counter + 1, period }, period);
        }, period, { subscriber, counter: 0, period })
    })
}

function take(count) {
    return source =>
        source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new TakeSubscriber(subscriber, count));
            }
        })
}

class TakeSubscriber extends Subscriber {
    constructor(destination, total) {
        super(destination);
        this.total = total;
        this.count = 0;
    }
    next(value) {
        const total = this.total;
        const count = ++this.count;
        if (count <= total) {
            this.destination.next(value);
            if (count === total) {
                this.destination.complete();
                this.unsubscribe();
            }
        }
    }
}

interval(1000)
    .pipe(
        take(3)
    )
    .subscribe({
        next(a){console.log(a)},
        complete(){console.log('complete');}
    })