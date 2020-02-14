var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/App.svelte generated by Svelte v3.18.2 */

    function create_fragment(ctx) {
    	let main;
    	let div0;
    	let t1;
    	let div1;
    	let label0;
    	let t3;
    	let input0;
    	let input0_updating = false;
    	let t4;
    	let div4;
    	let div2;
    	let label1;
    	let t6;
    	let input1;
    	let t7;
    	let div3;
    	let t8;
    	let t9;
    	let t10;
    	let div7;
    	let div5;
    	let label2;
    	let t12;
    	let input2;
    	let t13;
    	let div6;
    	let t14_value = (/*interesetSliderValue*/ ctx[0] / 100).toFixed(2) + "";
    	let t14;
    	let t15;
    	let t16;
    	let div8;
    	let t17;
    	let t18;
    	let t19;
    	let div9;
    	let t20;
    	let t21;
    	let t22;
    	let div10;
    	let t23;
    	let t24;
    	let dispose;

    	function input0_input_handler() {
    		input0_updating = true;
    		/*input0_input_handler*/ ctx[11].call(input0);
    	}

    	return {
    		c() {
    			main = element("main");
    			div0 = element("div");
    			div0.innerHTML = `<h1>Mortgage Calculator</h1>`;
    			t1 = space();
    			div1 = element("div");
    			label0 = element("label");
    			label0.textContent = "Loan Amount";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			div4 = element("div");
    			div2 = element("div");
    			label1 = element("label");
    			label1.textContent = "Years";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			div3 = element("div");
    			t8 = text(/*years*/ ctx[1]);
    			t9 = text(" years");
    			t10 = space();
    			div7 = element("div");
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "Interest Rate";
    			t12 = space();
    			input2 = element("input");
    			t13 = space();
    			div6 = element("div");
    			t14 = text(t14_value);
    			t15 = text("%");
    			t16 = space();
    			div8 = element("div");
    			t17 = text("Monthly Payments ");
    			t18 = text(/*monthlyPaymentsFormated*/ ctx[3]);
    			t19 = space();
    			div9 = element("div");
    			t20 = text("Total Paid ");
    			t21 = text(/*totalPaidFormated*/ ctx[4]);
    			t22 = space();
    			div10 = element("div");
    			t23 = text("Interest Paid ");
    			t24 = text(/*interestPaidFormated*/ ctx[5]);
    			attr(div0, "class", "row");
    			attr(input0, "class", "u-full-width");
    			attr(input0, "type", "number");
    			attr(input0, "min", "0");
    			attr(input0, "placeholder", "10000");
    			attr(div1, "class", "row");
    			attr(input1, "class", "u-full-width");
    			attr(input1, "type", "range");
    			attr(input1, "min", "1");
    			attr(input1, "max", "40");
    			attr(div2, "class", "six columns");
    			attr(div3, "class", "six columns outputs svelte-17fw0fv");
    			attr(div4, "class", "row");
    			attr(input2, "class", "u-full-width");
    			attr(input2, "type", "range");
    			attr(input2, "min", "1");
    			attr(input2, "max", "2000");
    			attr(div5, "class", "six columns");
    			attr(div6, "class", "six columns outputs svelte-17fw0fv");
    			attr(div7, "class", "row");
    			attr(div8, "class", "row outputs svelte-17fw0fv");
    			attr(div9, "class", "row outputs svelte-17fw0fv");
    			attr(div10, "class", "row outputs svelte-17fw0fv");
    			attr(main, "class", "container");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div0);
    			append(main, t1);
    			append(main, div1);
    			append(div1, label0);
    			append(div1, t3);
    			append(div1, input0);
    			set_input_value(input0, /*loanAmount*/ ctx[2]);
    			append(main, t4);
    			append(main, div4);
    			append(div4, div2);
    			append(div2, label1);
    			append(div2, t6);
    			append(div2, input1);
    			set_input_value(input1, /*years*/ ctx[1]);
    			append(div4, t7);
    			append(div4, div3);
    			append(div3, t8);
    			append(div3, t9);
    			append(main, t10);
    			append(main, div7);
    			append(div7, div5);
    			append(div5, label2);
    			append(div5, t12);
    			append(div5, input2);
    			set_input_value(input2, /*interesetSliderValue*/ ctx[0]);
    			append(div7, t13);
    			append(div7, div6);
    			append(div6, t14);
    			append(div6, t15);
    			append(main, t16);
    			append(main, div8);
    			append(div8, t17);
    			append(div8, t18);
    			append(main, t19);
    			append(main, div9);
    			append(div9, t20);
    			append(div9, t21);
    			append(main, t22);
    			append(main, div10);
    			append(div10, t23);
    			append(div10, t24);

    			dispose = [
    				listen(input0, "input", input0_input_handler),
    				listen(input1, "change", /*input1_change_input_handler*/ ctx[12]),
    				listen(input1, "input", /*input1_change_input_handler*/ ctx[12]),
    				listen(input2, "change", /*input2_change_input_handler*/ ctx[13]),
    				listen(input2, "input", /*input2_change_input_handler*/ ctx[13])
    			];
    		},
    		p(ctx, [dirty]) {
    			if (!input0_updating && dirty & /*loanAmount*/ 4) {
    				set_input_value(input0, /*loanAmount*/ ctx[2]);
    			}

    			input0_updating = false;

    			if (dirty & /*years*/ 2) {
    				set_input_value(input1, /*years*/ ctx[1]);
    			}

    			if (dirty & /*years*/ 2) set_data(t8, /*years*/ ctx[1]);

    			if (dirty & /*interesetSliderValue*/ 1) {
    				set_input_value(input2, /*interesetSliderValue*/ ctx[0]);
    			}

    			if (dirty & /*interesetSliderValue*/ 1 && t14_value !== (t14_value = (/*interesetSliderValue*/ ctx[0] / 100).toFixed(2) + "")) set_data(t14, t14_value);
    			if (dirty & /*monthlyPaymentsFormated*/ 8) set_data(t18, /*monthlyPaymentsFormated*/ ctx[3]);
    			if (dirty & /*totalPaidFormated*/ 16) set_data(t21, /*totalPaidFormated*/ ctx[4]);
    			if (dirty & /*interestPaidFormated*/ 32) set_data(t24, /*interestPaidFormated*/ ctx[5]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let interesetSliderValue = 375;
    	let years = 15;
    	let loanAmount = 650000;
    	const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

    	function input0_input_handler() {
    		loanAmount = to_number(this.value);
    		$$invalidate(2, loanAmount);
    	}

    	function input1_change_input_handler() {
    		years = to_number(this.value);
    		$$invalidate(1, years);
    	}

    	function input2_change_input_handler() {
    		interesetSliderValue = to_number(this.value);
    		$$invalidate(0, interesetSliderValue);
    	}

    	let totalPayments;
    	let monthlyInterestRate;
    	let monthlyPayments;
    	let totalPaid;
    	let monthlyPaymentsFormated;
    	let totalPaidFormated;
    	let interestPaidFormated;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*years*/ 2) {
    			 $$invalidate(6, totalPayments = years * 12);
    		}

    		if ($$self.$$.dirty & /*interesetSliderValue*/ 1) {
    			 $$invalidate(7, monthlyInterestRate = interesetSliderValue / 100 / 100 / 12);
    		}

    		if ($$self.$$.dirty & /*loanAmount, monthlyInterestRate, totalPayments*/ 196) {
    			 $$invalidate(8, monthlyPayments = loanAmount * Math.pow(1 + monthlyInterestRate, totalPayments) * monthlyInterestRate / (Math.pow(1 + monthlyInterestRate, totalPayments) - 1));
    		}

    		if ($$self.$$.dirty & /*monthlyPayments, totalPayments*/ 320) {
    			 $$invalidate(9, totalPaid = monthlyPayments * totalPayments);
    		}

    		if ($$self.$$.dirty & /*monthlyPayments*/ 256) {
    			 $$invalidate(3, monthlyPaymentsFormated = formatter.format(monthlyPayments));
    		}

    		if ($$self.$$.dirty & /*totalPaid*/ 512) {
    			 $$invalidate(4, totalPaidFormated = formatter.format(totalPaid));
    		}

    		if ($$self.$$.dirty & /*totalPaid, loanAmount*/ 516) {
    			 $$invalidate(5, interestPaidFormated = formatter.format(totalPaid - loanAmount));
    		}
    	};

    	return [
    		interesetSliderValue,
    		years,
    		loanAmount,
    		monthlyPaymentsFormated,
    		totalPaidFormated,
    		interestPaidFormated,
    		totalPayments,
    		monthlyInterestRate,
    		monthlyPayments,
    		totalPaid,
    		formatter,
    		input0_input_handler,
    		input1_change_input_handler,
    		input2_change_input_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
