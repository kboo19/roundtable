
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.head.appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
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
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
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
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
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
    const seen_callbacks = new Set();
    function flush() {
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
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

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function create_component(block) {
        block && block.c();
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

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.18.1' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    function styleInject(css, ref) {
      if ( ref === void 0 ) ref = {};
      var insertAt = ref.insertAt;

      if (!css || typeof document === 'undefined') { return; }

      var head = document.head || document.getElementsByTagName('head')[0];
      var style = document.createElement('style');
      style.type = 'text/css';

      if (insertAt === 'top') {
        if (head.firstChild) {
          head.insertBefore(style, head.firstChild);
        } else {
          head.appendChild(style);
        }
      } else {
        head.appendChild(style);
      }

      if (style.styleSheet) {
        style.styleSheet.cssText = css;
      } else {
        style.appendChild(document.createTextNode(css));
      }
    }

    var css = "@import url(\"https://fonts.googleapis.com/css?family=Nunito:400,700\");\n@keyframes spinAround {\n  from {\n    transform: rotate(0deg); }\n  to {\n    transform: rotate(359deg); } }\n\n.modal-close, .delete, .is-unselectable, .breadcrumb, .pagination-previous,\n.pagination-next,\n.pagination-link,\n.pagination-ellipsis, .tabs, .button, .file {\n  -webkit-touch-callout: none;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none; }\n\n.navbar-link:not(.is-arrowless)::after, .select:not(.is-multiple):not(.is-loading)::after {\n  border: 3px solid transparent;\n  border-radius: 2px;\n  border-right: 0;\n  border-top: 0;\n  content: \" \";\n  display: block;\n  height: 0.625em;\n  margin-top: -0.4375em;\n  pointer-events: none;\n  position: absolute;\n  top: 50%;\n  transform: rotate(-45deg);\n  transform-origin: center;\n  width: 0.625em; }\n\n.breadcrumb:not(:last-child), .level:not(:last-child), .list:not(:last-child), .message:not(:last-child), .pagination:not(:last-child), .tabs:not(:last-child), .box:not(:last-child), .content:not(:last-child), .notification:not(:last-child), .progress:not(:last-child), .table:not(:last-child), .table-container:not(:last-child), .title:not(:last-child),\n.subtitle:not(:last-child), .block:not(:last-child), .highlight:not(:last-child) {\n  margin-bottom: 1.5rem; }\n\n.modal-close, .delete {\n  -moz-appearance: none;\n  -webkit-appearance: none;\n  background-color: rgba(10, 10, 10, 0.2);\n  border: none;\n  border-radius: 290486px;\n  cursor: pointer;\n  pointer-events: auto;\n  display: inline-block;\n  flex-grow: 0;\n  flex-shrink: 0;\n  font-size: 0;\n  height: 20px;\n  max-height: 20px;\n  max-width: 20px;\n  min-height: 20px;\n  min-width: 20px;\n  outline: none;\n  position: relative;\n  vertical-align: top;\n  width: 20px; }\n  .modal-close::before, .delete::before, .modal-close::after, .delete::after {\n    background-color: white;\n    content: \"\";\n    display: block;\n    left: 50%;\n    position: absolute;\n    top: 50%;\n    transform: translateX(-50%) translateY(-50%) rotate(45deg);\n    transform-origin: center center; }\n  .modal-close::before, .delete::before {\n    height: 2px;\n    width: 50%; }\n  .modal-close::after, .delete::after {\n    height: 50%;\n    width: 2px; }\n  .modal-close:hover, .delete:hover, .modal-close:focus, .delete:focus {\n    background-color: rgba(10, 10, 10, 0.3); }\n  .modal-close:active, .delete:active {\n    background-color: rgba(10, 10, 10, 0.4); }\n  .is-small.modal-close, .is-small.delete {\n    height: 16px;\n    max-height: 16px;\n    max-width: 16px;\n    min-height: 16px;\n    min-width: 16px;\n    width: 16px; }\n  .is-medium.modal-close, .is-medium.delete {\n    height: 24px;\n    max-height: 24px;\n    max-width: 24px;\n    min-height: 24px;\n    min-width: 24px;\n    width: 24px; }\n  .is-large.modal-close, .is-large.delete {\n    height: 32px;\n    max-height: 32px;\n    max-width: 32px;\n    min-height: 32px;\n    min-width: 32px;\n    width: 32px; }\n\n.button.is-loading::after, .loader, .select.is-loading::after, .control.is-loading::after {\n  animation: spinAround 500ms infinite linear;\n  border: 2px solid #dbdbdb;\n  border-radius: 290486px;\n  border-right-color: transparent;\n  border-top-color: transparent;\n  content: \"\";\n  display: block;\n  height: 1em;\n  position: relative;\n  width: 1em; }\n\n.is-overlay, .modal, .modal-background, .image.is-square img,\n.image.is-square .has-ratio, .image.is-1by1 img,\n.image.is-1by1 .has-ratio, .image.is-5by4 img,\n.image.is-5by4 .has-ratio, .image.is-4by3 img,\n.image.is-4by3 .has-ratio, .image.is-3by2 img,\n.image.is-3by2 .has-ratio, .image.is-5by3 img,\n.image.is-5by3 .has-ratio, .image.is-16by9 img,\n.image.is-16by9 .has-ratio, .image.is-2by1 img,\n.image.is-2by1 .has-ratio, .image.is-3by1 img,\n.image.is-3by1 .has-ratio, .image.is-4by5 img,\n.image.is-4by5 .has-ratio, .image.is-3by4 img,\n.image.is-3by4 .has-ratio, .image.is-2by3 img,\n.image.is-2by3 .has-ratio, .image.is-3by5 img,\n.image.is-3by5 .has-ratio, .image.is-9by16 img,\n.image.is-9by16 .has-ratio, .image.is-1by2 img,\n.image.is-1by2 .has-ratio, .image.is-1by3 img,\n.image.is-1by3 .has-ratio, .hero-video {\n  bottom: 0;\n  left: 0;\n  position: absolute;\n  right: 0;\n  top: 0; }\n\n.pagination-previous,\n.pagination-next,\n.pagination-link,\n.pagination-ellipsis, .button, .input, .textarea, .select select, .file-cta,\n.file-name {\n  -moz-appearance: none;\n  -webkit-appearance: none;\n  align-items: center;\n  border: 2px solid transparent;\n  border-radius: 4px;\n  box-shadow: none;\n  display: inline-flex;\n  font-size: 1rem;\n  height: 2.5em;\n  justify-content: flex-start;\n  line-height: 1.5;\n  padding-bottom: calc(0.5em - 2px);\n  padding-left: calc(0.75em - 2px);\n  padding-right: calc(0.75em - 2px);\n  padding-top: calc(0.5em - 2px);\n  position: relative;\n  vertical-align: top; }\n  .pagination-previous:focus,\n  .pagination-next:focus,\n  .pagination-link:focus,\n  .pagination-ellipsis:focus, .button:focus, .input:focus, .textarea:focus, .select select:focus, .file-cta:focus,\n  .file-name:focus, .is-focused.pagination-previous,\n  .is-focused.pagination-next,\n  .is-focused.pagination-link,\n  .is-focused.pagination-ellipsis, .is-focused.button, .is-focused.input, .is-focused.textarea, .select select.is-focused, .is-focused.file-cta,\n  .is-focused.file-name, .pagination-previous:active,\n  .pagination-next:active,\n  .pagination-link:active,\n  .pagination-ellipsis:active, .button:active, .input:active, .textarea:active, .select select:active, .file-cta:active,\n  .file-name:active, .is-active.pagination-previous,\n  .is-active.pagination-next,\n  .is-active.pagination-link,\n  .is-active.pagination-ellipsis, .is-active.button, .is-active.input, .is-active.textarea, .select select.is-active, .is-active.file-cta,\n  .is-active.file-name {\n    outline: none; }\n  .pagination-previous[disabled],\n  .pagination-next[disabled],\n  .pagination-link[disabled],\n  .pagination-ellipsis[disabled], .button[disabled], .input[disabled], .textarea[disabled], .select select[disabled], .file-cta[disabled],\n  .file-name[disabled],\n  fieldset[disabled] .pagination-previous,\n  fieldset[disabled] .pagination-next,\n  fieldset[disabled] .pagination-link,\n  fieldset[disabled] .pagination-ellipsis,\n  fieldset[disabled] .button,\n  fieldset[disabled] .input,\n  fieldset[disabled] .textarea,\n  fieldset[disabled] .select select,\n  .select fieldset[disabled] select,\n  fieldset[disabled] .file-cta,\n  fieldset[disabled] .file-name {\n    cursor: not-allowed; }\n\n/*! minireset.css v0.0.6 | MIT License | github.com/jgthms/minireset.css */\nhtml,\nbody,\np,\nol,\nul,\nli,\ndl,\ndt,\ndd,\nblockquote,\nfigure,\nfieldset,\nlegend,\ntextarea,\npre,\niframe,\nhr,\nh1,\nh2,\nh3,\nh4,\nh5,\nh6 {\n  margin: 0;\n  padding: 0; }\n\nh1,\nh2,\nh3,\nh4,\nh5,\nh6 {\n  font-size: 100%;\n  font-weight: normal; }\n\nul {\n  list-style: none; }\n\nbutton,\ninput,\nselect,\ntextarea {\n  margin: 0; }\n\nhtml {\n  box-sizing: border-box; }\n\n*, *::before, *::after {\n  box-sizing: inherit; }\n\nimg,\nvideo {\n  height: auto;\n  max-width: 100%; }\n\niframe {\n  border: 0; }\n\ntable {\n  border-collapse: collapse;\n  border-spacing: 0; }\n\ntd,\nth {\n  padding: 0; }\n  td:not([align]),\n  th:not([align]) {\n    text-align: left; }\n\nhtml {\n  background-color: #EFF0EB;\n  font-size: 16px;\n  -moz-osx-font-smoothing: grayscale;\n  -webkit-font-smoothing: antialiased;\n  min-width: 300px;\n  overflow-x: hidden;\n  overflow-y: scroll;\n  text-rendering: optimizeLegibility;\n  text-size-adjust: 100%; }\n\narticle,\naside,\nfigure,\nfooter,\nheader,\nhgroup,\nsection {\n  display: block; }\n\nbody,\nbutton,\ninput,\nselect,\ntextarea {\n  font-family: \"Nunito\", sans-serif; }\n\ncode,\npre {\n  -moz-osx-font-smoothing: auto;\n  -webkit-font-smoothing: auto;\n  font-family: monospace; }\n\nbody {\n  color: #4a4a4a;\n  font-size: 1em;\n  font-weight: 400;\n  line-height: 1.5; }\n\na {\n  color: #3273dc;\n  cursor: pointer;\n  text-decoration: none; }\n  a strong {\n    color: currentColor; }\n  a:hover {\n    color: #363636; }\n\ncode {\n  background-color: whitesmoke;\n  color: #f14668;\n  font-size: 0.875em;\n  font-weight: normal;\n  padding: 0.25em 0.5em 0.25em; }\n\nhr {\n  background-color: whitesmoke;\n  border: none;\n  display: block;\n  height: 2px;\n  margin: 1.5rem 0; }\n\nimg {\n  height: auto;\n  max-width: 100%; }\n\ninput[type=\"checkbox\"],\ninput[type=\"radio\"] {\n  vertical-align: baseline; }\n\nsmall {\n  font-size: 0.875em; }\n\nspan {\n  font-style: inherit;\n  font-weight: inherit; }\n\nstrong {\n  color: #363636;\n  font-weight: 700; }\n\nfieldset {\n  border: none; }\n\npre {\n  -webkit-overflow-scrolling: touch;\n  background-color: whitesmoke;\n  color: #4a4a4a;\n  font-size: 0.875em;\n  overflow-x: auto;\n  padding: 1.25rem 1.5rem;\n  white-space: pre;\n  word-wrap: normal; }\n  pre code {\n    background-color: transparent;\n    color: currentColor;\n    font-size: 1em;\n    padding: 0; }\n\ntable td,\ntable th {\n  vertical-align: top; }\n  table td:not([align]),\n  table th:not([align]) {\n    text-align: left; }\n\ntable th {\n  color: #363636; }\n\n.is-clearfix::after {\n  clear: both;\n  content: \" \";\n  display: table; }\n\n.is-pulled-left {\n  float: left !important; }\n\n.is-pulled-right {\n  float: right !important; }\n\n.is-clipped {\n  overflow: hidden !important; }\n\n.is-size-1 {\n  font-size: 3rem !important; }\n\n.is-size-2 {\n  font-size: 2.5rem !important; }\n\n.is-size-3 {\n  font-size: 2rem !important; }\n\n.is-size-4 {\n  font-size: 1.5rem !important; }\n\n.is-size-5 {\n  font-size: 1.25rem !important; }\n\n.is-size-6 {\n  font-size: 1rem !important; }\n\n.is-size-7 {\n  font-size: 0.75rem !important; }\n\n@media screen and (max-width: 768px) {\n  .is-size-1-mobile {\n    font-size: 3rem !important; }\n  .is-size-2-mobile {\n    font-size: 2.5rem !important; }\n  .is-size-3-mobile {\n    font-size: 2rem !important; }\n  .is-size-4-mobile {\n    font-size: 1.5rem !important; }\n  .is-size-5-mobile {\n    font-size: 1.25rem !important; }\n  .is-size-6-mobile {\n    font-size: 1rem !important; }\n  .is-size-7-mobile {\n    font-size: 0.75rem !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-size-1-tablet {\n    font-size: 3rem !important; }\n  .is-size-2-tablet {\n    font-size: 2.5rem !important; }\n  .is-size-3-tablet {\n    font-size: 2rem !important; }\n  .is-size-4-tablet {\n    font-size: 1.5rem !important; }\n  .is-size-5-tablet {\n    font-size: 1.25rem !important; }\n  .is-size-6-tablet {\n    font-size: 1rem !important; }\n  .is-size-7-tablet {\n    font-size: 0.75rem !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-size-1-touch {\n    font-size: 3rem !important; }\n  .is-size-2-touch {\n    font-size: 2.5rem !important; }\n  .is-size-3-touch {\n    font-size: 2rem !important; }\n  .is-size-4-touch {\n    font-size: 1.5rem !important; }\n  .is-size-5-touch {\n    font-size: 1.25rem !important; }\n  .is-size-6-touch {\n    font-size: 1rem !important; }\n  .is-size-7-touch {\n    font-size: 0.75rem !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-size-1-desktop {\n    font-size: 3rem !important; }\n  .is-size-2-desktop {\n    font-size: 2.5rem !important; }\n  .is-size-3-desktop {\n    font-size: 2rem !important; }\n  .is-size-4-desktop {\n    font-size: 1.5rem !important; }\n  .is-size-5-desktop {\n    font-size: 1.25rem !important; }\n  .is-size-6-desktop {\n    font-size: 1rem !important; }\n  .is-size-7-desktop {\n    font-size: 0.75rem !important; } }\n\n.has-text-centered {\n  text-align: center !important; }\n\n.has-text-justified {\n  text-align: justify !important; }\n\n.has-text-left {\n  text-align: left !important; }\n\n.has-text-right {\n  text-align: right !important; }\n\n@media screen and (max-width: 768px) {\n  .has-text-centered-mobile {\n    text-align: center !important; } }\n\n@media screen and (min-width: 769px), print {\n  .has-text-centered-tablet {\n    text-align: center !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .has-text-centered-tablet-only {\n    text-align: center !important; } }\n\n@media screen and (max-width: 1023px) {\n  .has-text-centered-touch {\n    text-align: center !important; } }\n\n@media screen and (min-width: 1024px) {\n  .has-text-centered-desktop {\n    text-align: center !important; } }\n\n@media screen and (max-width: 768px) {\n  .has-text-justified-mobile {\n    text-align: justify !important; } }\n\n@media screen and (min-width: 769px), print {\n  .has-text-justified-tablet {\n    text-align: justify !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .has-text-justified-tablet-only {\n    text-align: justify !important; } }\n\n@media screen and (max-width: 1023px) {\n  .has-text-justified-touch {\n    text-align: justify !important; } }\n\n@media screen and (min-width: 1024px) {\n  .has-text-justified-desktop {\n    text-align: justify !important; } }\n\n@media screen and (max-width: 768px) {\n  .has-text-left-mobile {\n    text-align: left !important; } }\n\n@media screen and (min-width: 769px), print {\n  .has-text-left-tablet {\n    text-align: left !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .has-text-left-tablet-only {\n    text-align: left !important; } }\n\n@media screen and (max-width: 1023px) {\n  .has-text-left-touch {\n    text-align: left !important; } }\n\n@media screen and (min-width: 1024px) {\n  .has-text-left-desktop {\n    text-align: left !important; } }\n\n@media screen and (max-width: 768px) {\n  .has-text-right-mobile {\n    text-align: right !important; } }\n\n@media screen and (min-width: 769px), print {\n  .has-text-right-tablet {\n    text-align: right !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .has-text-right-tablet-only {\n    text-align: right !important; } }\n\n@media screen and (max-width: 1023px) {\n  .has-text-right-touch {\n    text-align: right !important; } }\n\n@media screen and (min-width: 1024px) {\n  .has-text-right-desktop {\n    text-align: right !important; } }\n\n.is-capitalized {\n  text-transform: capitalize !important; }\n\n.is-lowercase {\n  text-transform: lowercase !important; }\n\n.is-uppercase {\n  text-transform: uppercase !important; }\n\n.is-italic {\n  font-style: italic !important; }\n\n.has-text-white {\n  color: white !important; }\n\na.has-text-white:hover, a.has-text-white:focus {\n  color: #e6e6e6 !important; }\n\n.has-background-white {\n  background-color: white !important; }\n\n.has-text-black {\n  color: #0a0a0a !important; }\n\na.has-text-black:hover, a.has-text-black:focus {\n  color: black !important; }\n\n.has-background-black {\n  background-color: #0a0a0a !important; }\n\n.has-text-light {\n  color: whitesmoke !important; }\n\na.has-text-light:hover, a.has-text-light:focus {\n  color: #dbdbdb !important; }\n\n.has-background-light {\n  background-color: whitesmoke !important; }\n\n.has-text-dark {\n  color: #353A48 !important; }\n\na.has-text-dark:hover, a.has-text-dark:focus {\n  color: #1f222b !important; }\n\n.has-background-dark {\n  background-color: #353A48 !important; }\n\n.has-text-primary {\n  color: #74BE43 !important; }\n\na.has-text-primary:hover, a.has-text-primary:focus {\n  color: #5d9935 !important; }\n\n.has-background-primary {\n  background-color: #74BE43 !important; }\n\n.has-text-link {\n  color: #3273dc !important; }\n\na.has-text-link:hover, a.has-text-link:focus {\n  color: #205bbc !important; }\n\n.has-background-link {\n  background-color: #3273dc !important; }\n\n.has-text-info {\n  color: #3298dc !important; }\n\na.has-text-info:hover, a.has-text-info:focus {\n  color: #207dbc !important; }\n\n.has-background-info {\n  background-color: #3298dc !important; }\n\n.has-text-success {\n  color: #74BE43 !important; }\n\na.has-text-success:hover, a.has-text-success:focus {\n  color: #5d9935 !important; }\n\n.has-background-success {\n  background-color: #74BE43 !important; }\n\n.has-text-warning {\n  color: #ffdd57 !important; }\n\na.has-text-warning:hover, a.has-text-warning:focus {\n  color: #ffd324 !important; }\n\n.has-background-warning {\n  background-color: #ffdd57 !important; }\n\n.has-text-danger {\n  color: #f14668 !important; }\n\na.has-text-danger:hover, a.has-text-danger:focus {\n  color: #ee1742 !important; }\n\n.has-background-danger {\n  background-color: #f14668 !important; }\n\n.has-text-black-bis {\n  color: #121212 !important; }\n\n.has-background-black-bis {\n  background-color: #121212 !important; }\n\n.has-text-black-ter {\n  color: #242424 !important; }\n\n.has-background-black-ter {\n  background-color: #242424 !important; }\n\n.has-text-grey-darker {\n  color: #363636 !important; }\n\n.has-background-grey-darker {\n  background-color: #363636 !important; }\n\n.has-text-grey-dark {\n  color: #4a4a4a !important; }\n\n.has-background-grey-dark {\n  background-color: #4a4a4a !important; }\n\n.has-text-grey {\n  color: #7a7a7a !important; }\n\n.has-background-grey {\n  background-color: #7a7a7a !important; }\n\n.has-text-grey-light {\n  color: #b5b5b5 !important; }\n\n.has-background-grey-light {\n  background-color: #b5b5b5 !important; }\n\n.has-text-grey-lighter {\n  color: #dbdbdb !important; }\n\n.has-background-grey-lighter {\n  background-color: #dbdbdb !important; }\n\n.has-text-white-ter {\n  color: whitesmoke !important; }\n\n.has-background-white-ter {\n  background-color: whitesmoke !important; }\n\n.has-text-white-bis {\n  color: #fafafa !important; }\n\n.has-background-white-bis {\n  background-color: #fafafa !important; }\n\n.has-text-weight-light {\n  font-weight: 300 !important; }\n\n.has-text-weight-normal {\n  font-weight: 400 !important; }\n\n.has-text-weight-medium {\n  font-weight: 500 !important; }\n\n.has-text-weight-semibold {\n  font-weight: 600 !important; }\n\n.has-text-weight-bold {\n  font-weight: 700 !important; }\n\n.is-family-primary {\n  font-family: \"Nunito\", sans-serif !important; }\n\n.is-family-secondary {\n  font-family: \"Nunito\", sans-serif !important; }\n\n.is-family-sans-serif {\n  font-family: \"Nunito\", sans-serif !important; }\n\n.is-family-monospace {\n  font-family: monospace !important; }\n\n.is-family-code {\n  font-family: monospace !important; }\n\n.is-block {\n  display: block !important; }\n\n@media screen and (max-width: 768px) {\n  .is-block-mobile {\n    display: block !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-block-tablet {\n    display: block !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-block-tablet-only {\n    display: block !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-block-touch {\n    display: block !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-block-desktop {\n    display: block !important; } }\n\n.is-flex {\n  display: flex !important; }\n\n@media screen and (max-width: 768px) {\n  .is-flex-mobile {\n    display: flex !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-flex-tablet {\n    display: flex !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-flex-tablet-only {\n    display: flex !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-flex-touch {\n    display: flex !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-flex-desktop {\n    display: flex !important; } }\n\n.is-inline {\n  display: inline !important; }\n\n@media screen and (max-width: 768px) {\n  .is-inline-mobile {\n    display: inline !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-inline-tablet {\n    display: inline !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-inline-tablet-only {\n    display: inline !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-inline-touch {\n    display: inline !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-inline-desktop {\n    display: inline !important; } }\n\n.is-inline-block {\n  display: inline-block !important; }\n\n@media screen and (max-width: 768px) {\n  .is-inline-block-mobile {\n    display: inline-block !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-inline-block-tablet {\n    display: inline-block !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-inline-block-tablet-only {\n    display: inline-block !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-inline-block-touch {\n    display: inline-block !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-inline-block-desktop {\n    display: inline-block !important; } }\n\n.is-inline-flex {\n  display: inline-flex !important; }\n\n@media screen and (max-width: 768px) {\n  .is-inline-flex-mobile {\n    display: inline-flex !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-inline-flex-tablet {\n    display: inline-flex !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-inline-flex-tablet-only {\n    display: inline-flex !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-inline-flex-touch {\n    display: inline-flex !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-inline-flex-desktop {\n    display: inline-flex !important; } }\n\n.is-hidden {\n  display: none !important; }\n\n.is-sr-only {\n  border: none !important;\n  clip: rect(0, 0, 0, 0) !important;\n  height: 0.01em !important;\n  overflow: hidden !important;\n  padding: 0 !important;\n  position: absolute !important;\n  white-space: nowrap !important;\n  width: 0.01em !important; }\n\n@media screen and (max-width: 768px) {\n  .is-hidden-mobile {\n    display: none !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-hidden-tablet {\n    display: none !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-hidden-tablet-only {\n    display: none !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-hidden-touch {\n    display: none !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-hidden-desktop {\n    display: none !important; } }\n\n.is-invisible {\n  visibility: hidden !important; }\n\n@media screen and (max-width: 768px) {\n  .is-invisible-mobile {\n    visibility: hidden !important; } }\n\n@media screen and (min-width: 769px), print {\n  .is-invisible-tablet {\n    visibility: hidden !important; } }\n\n@media screen and (min-width: 769px) and (max-width: 1023px) {\n  .is-invisible-tablet-only {\n    visibility: hidden !important; } }\n\n@media screen and (max-width: 1023px) {\n  .is-invisible-touch {\n    visibility: hidden !important; } }\n\n@media screen and (min-width: 1024px) {\n  .is-invisible-desktop {\n    visibility: hidden !important; } }\n\n.is-marginless {\n  margin: 0 !important; }\n\n.is-paddingless {\n  padding: 0 !important; }\n\n.is-radiusless {\n  border-radius: 0 !important; }\n\n.is-shadowless {\n  box-shadow: none !important; }\n\n.is-relative {\n  position: relative !important; }\n\n.breadcrumb {\n  font-size: 1rem;\n  white-space: nowrap; }\n  .breadcrumb a {\n    align-items: center;\n    color: #3273dc;\n    display: flex;\n    justify-content: center;\n    padding: 0 0.75em; }\n    .breadcrumb a:hover {\n      color: #363636; }\n  .breadcrumb li {\n    align-items: center;\n    display: flex; }\n    .breadcrumb li:first-child a {\n      padding-left: 0; }\n    .breadcrumb li.is-active a {\n      color: #363636;\n      cursor: default;\n      pointer-events: none; }\n    .breadcrumb li + li::before {\n      color: #b5b5b5;\n      content: \"\\0002f\"; }\n  .breadcrumb ul,\n  .breadcrumb ol {\n    align-items: flex-start;\n    display: flex;\n    flex-wrap: wrap;\n    justify-content: flex-start; }\n  .breadcrumb .icon:first-child {\n    margin-right: 0.5em; }\n  .breadcrumb .icon:last-child {\n    margin-left: 0.5em; }\n  .breadcrumb.is-centered ol,\n  .breadcrumb.is-centered ul {\n    justify-content: center; }\n  .breadcrumb.is-right ol,\n  .breadcrumb.is-right ul {\n    justify-content: flex-end; }\n  .breadcrumb.is-small {\n    font-size: 0.75rem; }\n  .breadcrumb.is-medium {\n    font-size: 1.25rem; }\n  .breadcrumb.is-large {\n    font-size: 1.5rem; }\n  .breadcrumb.has-arrow-separator li + li::before {\n    content: \"\\02192\"; }\n  .breadcrumb.has-bullet-separator li + li::before {\n    content: \"\\02022\"; }\n  .breadcrumb.has-dot-separator li + li::before {\n    content: \"\\000b7\"; }\n  .breadcrumb.has-succeeds-separator li + li::before {\n    content: \"\\0227B\"; }\n\n.card {\n  background-color: white;\n  box-shadow: 0 0.5em 1em -0.125em rgba(10, 10, 10, 0.1), 0 0px 0 1px rgba(10, 10, 10, 0.02);\n  color: #4a4a4a;\n  max-width: 100%;\n  position: relative; }\n\n.card-header {\n  background-color: transparent;\n  align-items: stretch;\n  box-shadow: 0 0.125em 0.25em rgba(10, 10, 10, 0.1);\n  display: flex; }\n\n.card-header-title {\n  align-items: center;\n  color: #363636;\n  display: flex;\n  flex-grow: 1;\n  font-weight: 700;\n  padding: 0.75rem 1rem; }\n  .card-header-title.is-centered {\n    justify-content: center; }\n\n.card-header-icon {\n  align-items: center;\n  cursor: pointer;\n  display: flex;\n  justify-content: center;\n  padding: 0.75rem 1rem; }\n\n.card-image {\n  display: block;\n  position: relative; }\n\n.card-content {\n  background-color: transparent;\n  padding: 1.5rem; }\n\n.card-footer {\n  background-color: transparent;\n  border-top: 1px solid #ededed;\n  align-items: stretch;\n  display: flex; }\n\n.card-footer-item {\n  align-items: center;\n  display: flex;\n  flex-basis: 0;\n  flex-grow: 1;\n  flex-shrink: 0;\n  justify-content: center;\n  padding: 0.75rem; }\n  .card-footer-item:not(:last-child) {\n    border-right: 1px solid #ededed; }\n\n.card .media:not(:last-child) {\n  margin-bottom: 1.5rem; }\n\n.dropdown {\n  display: inline-flex;\n  position: relative;\n  vertical-align: top; }\n  .dropdown.is-active .dropdown-menu, .dropdown.is-hoverable:hover .dropdown-menu {\n    display: block; }\n  .dropdown.is-right .dropdown-menu {\n    left: auto;\n    right: 0; }\n  .dropdown.is-up .dropdown-menu {\n    bottom: 100%;\n    padding-bottom: 4px;\n    padding-top: initial;\n    top: auto; }\n\n.dropdown-menu {\n  display: none;\n  left: 0;\n  min-width: 12rem;\n  padding-top: 4px;\n  position: absolute;\n  top: 100%;\n  z-index: 20; }\n\n.dropdown-content {\n  background-color: white;\n  border-radius: 4px;\n  box-shadow: 0 0.5em 1em -0.125em rgba(10, 10, 10, 0.1), 0 0px 0 1px rgba(10, 10, 10, 0.02);\n  padding-bottom: 0.5rem;\n  padding-top: 0.5rem; }\n\n.dropdown-item {\n  color: #4a4a4a;\n  display: block;\n  font-size: 0.875rem;\n  line-height: 1.5;\n  padding: 0.375rem 1rem;\n  position: relative; }\n\na.dropdown-item,\nbutton.dropdown-item {\n  padding-right: 3rem;\n  text-align: left;\n  white-space: nowrap;\n  width: 100%; }\n  a.dropdown-item:hover,\n  button.dropdown-item:hover {\n    background-color: whitesmoke;\n    color: #0a0a0a; }\n  a.dropdown-item.is-active,\n  button.dropdown-item.is-active {\n    background-color: #3273dc;\n    color: #fff; }\n\n.dropdown-divider {\n  background-color: #ededed;\n  border: none;\n  display: block;\n  height: 1px;\n  margin: 0.5rem 0; }\n\n.level {\n  align-items: center;\n  justify-content: space-between; }\n  .level code {\n    border-radius: 4px; }\n  .level img {\n    display: inline-block;\n    vertical-align: top; }\n  .level.is-mobile {\n    display: flex; }\n    .level.is-mobile .level-left,\n    .level.is-mobile .level-right {\n      display: flex; }\n    .level.is-mobile .level-left + .level-right {\n      margin-top: 0; }\n    .level.is-mobile .level-item:not(:last-child) {\n      margin-bottom: 0;\n      margin-right: 0.75rem; }\n    .level.is-mobile .level-item:not(.is-narrow) {\n      flex-grow: 1; }\n  @media screen and (min-width: 769px), print {\n    .level {\n      display: flex; }\n      .level > .level-item:not(.is-narrow) {\n        flex-grow: 1; } }\n\n.level-item {\n  align-items: center;\n  display: flex;\n  flex-basis: auto;\n  flex-grow: 0;\n  flex-shrink: 0;\n  justify-content: center; }\n  .level-item .title,\n  .level-item .subtitle {\n    margin-bottom: 0; }\n  @media screen and (max-width: 768px) {\n    .level-item:not(:last-child) {\n      margin-bottom: 0.75rem; } }\n\n.level-left,\n.level-right {\n  flex-basis: auto;\n  flex-grow: 0;\n  flex-shrink: 0; }\n  .level-left .level-item.is-flexible,\n  .level-right .level-item.is-flexible {\n    flex-grow: 1; }\n  @media screen and (min-width: 769px), print {\n    .level-left .level-item:not(:last-child),\n    .level-right .level-item:not(:last-child) {\n      margin-right: 0.75rem; } }\n\n.level-left {\n  align-items: center;\n  justify-content: flex-start; }\n  @media screen and (max-width: 768px) {\n    .level-left + .level-right {\n      margin-top: 1.5rem; } }\n  @media screen and (min-width: 769px), print {\n    .level-left {\n      display: flex; } }\n\n.level-right {\n  align-items: center;\n  justify-content: flex-end; }\n  @media screen and (min-width: 769px), print {\n    .level-right {\n      display: flex; } }\n\n.list {\n  background-color: white;\n  border-radius: 4px;\n  box-shadow: 0 2px 3px rgba(10, 10, 10, 0.1), 0 0 0 1px rgba(10, 10, 10, 0.1); }\n\n.list-item {\n  display: block;\n  padding: 0.5em 1em; }\n  .list-item:not(a) {\n    color: #4a4a4a; }\n  .list-item:first-child {\n    border-top-left-radius: 4px;\n    border-top-right-radius: 4px; }\n  .list-item:last-child {\n    border-bottom-left-radius: 4px;\n    border-bottom-right-radius: 4px; }\n  .list-item:not(:last-child) {\n    border-bottom: 1px solid #dbdbdb; }\n  .list-item.is-active {\n    background-color: #3273dc;\n    color: #fff; }\n\na.list-item {\n  background-color: whitesmoke;\n  cursor: pointer; }\n\n.media {\n  align-items: flex-start;\n  display: flex;\n  text-align: left; }\n  .media .content:not(:last-child) {\n    margin-bottom: 0.75rem; }\n  .media .media {\n    border-top: 1px solid rgba(219, 219, 219, 0.5);\n    display: flex;\n    padding-top: 0.75rem; }\n    .media .media .content:not(:last-child),\n    .media .media .control:not(:last-child) {\n      margin-bottom: 0.5rem; }\n    .media .media .media {\n      padding-top: 0.5rem; }\n      .media .media .media + .media {\n        margin-top: 0.5rem; }\n  .media + .media {\n    border-top: 1px solid rgba(219, 219, 219, 0.5);\n    margin-top: 1rem;\n    padding-top: 1rem; }\n  .media.is-large + .media {\n    margin-top: 1.5rem;\n    padding-top: 1.5rem; }\n\n.media-left,\n.media-right {\n  flex-basis: auto;\n  flex-grow: 0;\n  flex-shrink: 0; }\n\n.media-left {\n  margin-right: 1rem; }\n\n.media-right {\n  margin-left: 1rem; }\n\n.media-content {\n  flex-basis: auto;\n  flex-grow: 1;\n  flex-shrink: 1;\n  text-align: left; }\n\n@media screen and (max-width: 768px) {\n  .media-content {\n    overflow-x: auto; } }\n\n.menu {\n  font-size: 1rem; }\n  .menu.is-small {\n    font-size: 0.75rem; }\n  .menu.is-medium {\n    font-size: 1.25rem; }\n  .menu.is-large {\n    font-size: 1.5rem; }\n\n.menu-list {\n  line-height: 1.25; }\n  .menu-list a {\n    border-radius: 2px;\n    color: #4a4a4a;\n    display: block;\n    padding: 0.5em 0.75em; }\n    .menu-list a:hover {\n      background-color: whitesmoke;\n      color: #363636; }\n    .menu-list a.is-active {\n      background-color: #3273dc;\n      color: #fff; }\n  .menu-list li ul {\n    border-left: 1px solid #dbdbdb;\n    margin: 0.75em;\n    padding-left: 0.75em; }\n\n.menu-label {\n  color: #7a7a7a;\n  font-size: 0.75em;\n  letter-spacing: 0.1em;\n  text-transform: uppercase; }\n  .menu-label:not(:first-child) {\n    margin-top: 1em; }\n  .menu-label:not(:last-child) {\n    margin-bottom: 1em; }\n\n.message {\n  background-color: whitesmoke;\n  border-radius: 4px;\n  font-size: 1rem; }\n  .message strong {\n    color: currentColor; }\n  .message a:not(.button):not(.tag):not(.dropdown-item) {\n    color: currentColor;\n    text-decoration: underline; }\n  .message.is-small {\n    font-size: 0.75rem; }\n  .message.is-medium {\n    font-size: 1.25rem; }\n  .message.is-large {\n    font-size: 1.5rem; }\n  .message.is-white {\n    background-color: white; }\n    .message.is-white .message-header {\n      background-color: white;\n      color: #0a0a0a; }\n    .message.is-white .message-body {\n      border-color: white; }\n  .message.is-black {\n    background-color: #fafafa; }\n    .message.is-black .message-header {\n      background-color: #0a0a0a;\n      color: white; }\n    .message.is-black .message-body {\n      border-color: #0a0a0a; }\n  .message.is-light {\n    background-color: #fafafa; }\n    .message.is-light .message-header {\n      background-color: whitesmoke;\n      color: rgba(0, 0, 0, 0.7); }\n    .message.is-light .message-body {\n      border-color: whitesmoke; }\n  .message.is-dark {\n    background-color: #f9fafb; }\n    .message.is-dark .message-header {\n      background-color: #353A48;\n      color: #fff; }\n    .message.is-dark .message-body {\n      border-color: #353A48; }\n  .message.is-primary {\n    background-color: #f4faf0; }\n    .message.is-primary .message-header {\n      background-color: #74BE43;\n      color: #fff; }\n    .message.is-primary .message-body {\n      border-color: #74BE43;\n      color: #4a792a; }\n  .message.is-link {\n    background-color: #eef3fc; }\n    .message.is-link .message-header {\n      background-color: #3273dc;\n      color: #fff; }\n    .message.is-link .message-body {\n      border-color: #3273dc;\n      color: #2160c4; }\n  .message.is-info {\n    background-color: #eef6fc; }\n    .message.is-info .message-header {\n      background-color: #3298dc;\n      color: #fff; }\n    .message.is-info .message-body {\n      border-color: #3298dc;\n      color: #1d72aa; }\n  .message.is-success {\n    background-color: #f4faf0; }\n    .message.is-success .message-header {\n      background-color: #74BE43;\n      color: #fff; }\n    .message.is-success .message-body {\n      border-color: #74BE43;\n      color: #4a792a; }\n  .message.is-warning {\n    background-color: #fffbeb; }\n    .message.is-warning .message-header {\n      background-color: #ffdd57;\n      color: rgba(0, 0, 0, 0.7); }\n    .message.is-warning .message-body {\n      border-color: #ffdd57;\n      color: #947600; }\n  .message.is-danger {\n    background-color: #feecf0; }\n    .message.is-danger .message-header {\n      background-color: #f14668;\n      color: #fff; }\n    .message.is-danger .message-body {\n      border-color: #f14668;\n      color: #cc0f35; }\n\n.message-header {\n  align-items: center;\n  background-color: #4a4a4a;\n  border-radius: 4px 4px 0 0;\n  color: #fff;\n  display: flex;\n  font-weight: 700;\n  justify-content: space-between;\n  line-height: 1.25;\n  padding: 0.75em 1em;\n  position: relative; }\n  .message-header .delete {\n    flex-grow: 0;\n    flex-shrink: 0;\n    margin-left: 0.75em; }\n  .message-header + .message-body {\n    border-width: 0;\n    border-top-left-radius: 0;\n    border-top-right-radius: 0; }\n\n.message-body {\n  border-color: #dbdbdb;\n  border-radius: 4px;\n  border-style: solid;\n  border-width: 0 0 0 4px;\n  color: #4a4a4a;\n  padding: 1.25em 1.5em; }\n  .message-body code,\n  .message-body pre {\n    background-color: white; }\n  .message-body pre code {\n    background-color: transparent; }\n\n.modal {\n  align-items: center;\n  display: none;\n  flex-direction: column;\n  justify-content: center;\n  overflow: hidden;\n  position: fixed;\n  z-index: 40; }\n  .modal.is-active {\n    display: flex; }\n\n.modal-background {\n  background-color: rgba(10, 10, 10, 0.86); }\n\n.modal-content,\n.modal-card {\n  margin: 0 20px;\n  max-height: calc(100vh - 160px);\n  overflow: auto;\n  position: relative;\n  width: 100%; }\n  @media screen and (min-width: 769px), print {\n    .modal-content,\n    .modal-card {\n      margin: 0 auto;\n      max-height: calc(100vh - 40px);\n      width: 640px; } }\n\n.modal-close {\n  background: none;\n  height: 40px;\n  position: fixed;\n  right: 20px;\n  top: 20px;\n  width: 40px; }\n\n.modal-card {\n  display: flex;\n  flex-direction: column;\n  max-height: calc(100vh - 40px);\n  overflow: hidden;\n  -ms-overflow-y: visible; }\n\n.modal-card-head,\n.modal-card-foot {\n  align-items: center;\n  background-color: whitesmoke;\n  display: flex;\n  flex-shrink: 0;\n  justify-content: flex-start;\n  padding: 20px;\n  position: relative; }\n\n.modal-card-head {\n  border-bottom: 1px solid #dbdbdb;\n  border-top-left-radius: 6px;\n  border-top-right-radius: 6px; }\n\n.modal-card-title {\n  color: #363636;\n  flex-grow: 1;\n  flex-shrink: 0;\n  font-size: 1.5rem;\n  line-height: 1; }\n\n.modal-card-foot {\n  border-bottom-left-radius: 6px;\n  border-bottom-right-radius: 6px;\n  border-top: 1px solid #dbdbdb; }\n  .modal-card-foot .button:not(:last-child) {\n    margin-right: 0.5em; }\n\n.modal-card-body {\n  -webkit-overflow-scrolling: touch;\n  background-color: white;\n  flex-grow: 1;\n  flex-shrink: 1;\n  overflow: auto;\n  padding: 20px; }\n\n.navbar {\n  background-color: white;\n  min-height: 3.25rem;\n  position: relative;\n  z-index: 30; }\n  .navbar.is-white {\n    background-color: white;\n    color: #0a0a0a; }\n    .navbar.is-white .navbar-brand > .navbar-item,\n    .navbar.is-white .navbar-brand .navbar-link {\n      color: #0a0a0a; }\n    .navbar.is-white .navbar-brand > a.navbar-item:focus, .navbar.is-white .navbar-brand > a.navbar-item:hover, .navbar.is-white .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-white .navbar-brand .navbar-link:focus,\n    .navbar.is-white .navbar-brand .navbar-link:hover,\n    .navbar.is-white .navbar-brand .navbar-link.is-active {\n      background-color: #f2f2f2;\n      color: #0a0a0a; }\n    .navbar.is-white .navbar-brand .navbar-link::after {\n      border-color: #0a0a0a; }\n    .navbar.is-white .navbar-burger {\n      color: #0a0a0a; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-white .navbar-start > .navbar-item,\n      .navbar.is-white .navbar-start .navbar-link,\n      .navbar.is-white .navbar-end > .navbar-item,\n      .navbar.is-white .navbar-end .navbar-link {\n        color: #0a0a0a; }\n      .navbar.is-white .navbar-start > a.navbar-item:focus, .navbar.is-white .navbar-start > a.navbar-item:hover, .navbar.is-white .navbar-start > a.navbar-item.is-active,\n      .navbar.is-white .navbar-start .navbar-link:focus,\n      .navbar.is-white .navbar-start .navbar-link:hover,\n      .navbar.is-white .navbar-start .navbar-link.is-active,\n      .navbar.is-white .navbar-end > a.navbar-item:focus,\n      .navbar.is-white .navbar-end > a.navbar-item:hover,\n      .navbar.is-white .navbar-end > a.navbar-item.is-active,\n      .navbar.is-white .navbar-end .navbar-link:focus,\n      .navbar.is-white .navbar-end .navbar-link:hover,\n      .navbar.is-white .navbar-end .navbar-link.is-active {\n        background-color: #f2f2f2;\n        color: #0a0a0a; }\n      .navbar.is-white .navbar-start .navbar-link::after,\n      .navbar.is-white .navbar-end .navbar-link::after {\n        border-color: #0a0a0a; }\n      .navbar.is-white .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-white .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-white .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #f2f2f2;\n        color: #0a0a0a; }\n      .navbar.is-white .navbar-dropdown a.navbar-item.is-active {\n        background-color: white;\n        color: #0a0a0a; } }\n  .navbar.is-black {\n    background-color: #0a0a0a;\n    color: white; }\n    .navbar.is-black .navbar-brand > .navbar-item,\n    .navbar.is-black .navbar-brand .navbar-link {\n      color: white; }\n    .navbar.is-black .navbar-brand > a.navbar-item:focus, .navbar.is-black .navbar-brand > a.navbar-item:hover, .navbar.is-black .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-black .navbar-brand .navbar-link:focus,\n    .navbar.is-black .navbar-brand .navbar-link:hover,\n    .navbar.is-black .navbar-brand .navbar-link.is-active {\n      background-color: black;\n      color: white; }\n    .navbar.is-black .navbar-brand .navbar-link::after {\n      border-color: white; }\n    .navbar.is-black .navbar-burger {\n      color: white; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-black .navbar-start > .navbar-item,\n      .navbar.is-black .navbar-start .navbar-link,\n      .navbar.is-black .navbar-end > .navbar-item,\n      .navbar.is-black .navbar-end .navbar-link {\n        color: white; }\n      .navbar.is-black .navbar-start > a.navbar-item:focus, .navbar.is-black .navbar-start > a.navbar-item:hover, .navbar.is-black .navbar-start > a.navbar-item.is-active,\n      .navbar.is-black .navbar-start .navbar-link:focus,\n      .navbar.is-black .navbar-start .navbar-link:hover,\n      .navbar.is-black .navbar-start .navbar-link.is-active,\n      .navbar.is-black .navbar-end > a.navbar-item:focus,\n      .navbar.is-black .navbar-end > a.navbar-item:hover,\n      .navbar.is-black .navbar-end > a.navbar-item.is-active,\n      .navbar.is-black .navbar-end .navbar-link:focus,\n      .navbar.is-black .navbar-end .navbar-link:hover,\n      .navbar.is-black .navbar-end .navbar-link.is-active {\n        background-color: black;\n        color: white; }\n      .navbar.is-black .navbar-start .navbar-link::after,\n      .navbar.is-black .navbar-end .navbar-link::after {\n        border-color: white; }\n      .navbar.is-black .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-black .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-black .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: black;\n        color: white; }\n      .navbar.is-black .navbar-dropdown a.navbar-item.is-active {\n        background-color: #0a0a0a;\n        color: white; } }\n  .navbar.is-light {\n    background-color: whitesmoke;\n    color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-light .navbar-brand > .navbar-item,\n    .navbar.is-light .navbar-brand .navbar-link {\n      color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-light .navbar-brand > a.navbar-item:focus, .navbar.is-light .navbar-brand > a.navbar-item:hover, .navbar.is-light .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-light .navbar-brand .navbar-link:focus,\n    .navbar.is-light .navbar-brand .navbar-link:hover,\n    .navbar.is-light .navbar-brand .navbar-link.is-active {\n      background-color: #e8e8e8;\n      color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-light .navbar-brand .navbar-link::after {\n      border-color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-light .navbar-burger {\n      color: rgba(0, 0, 0, 0.7); }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-light .navbar-start > .navbar-item,\n      .navbar.is-light .navbar-start .navbar-link,\n      .navbar.is-light .navbar-end > .navbar-item,\n      .navbar.is-light .navbar-end .navbar-link {\n        color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-light .navbar-start > a.navbar-item:focus, .navbar.is-light .navbar-start > a.navbar-item:hover, .navbar.is-light .navbar-start > a.navbar-item.is-active,\n      .navbar.is-light .navbar-start .navbar-link:focus,\n      .navbar.is-light .navbar-start .navbar-link:hover,\n      .navbar.is-light .navbar-start .navbar-link.is-active,\n      .navbar.is-light .navbar-end > a.navbar-item:focus,\n      .navbar.is-light .navbar-end > a.navbar-item:hover,\n      .navbar.is-light .navbar-end > a.navbar-item.is-active,\n      .navbar.is-light .navbar-end .navbar-link:focus,\n      .navbar.is-light .navbar-end .navbar-link:hover,\n      .navbar.is-light .navbar-end .navbar-link.is-active {\n        background-color: #e8e8e8;\n        color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-light .navbar-start .navbar-link::after,\n      .navbar.is-light .navbar-end .navbar-link::after {\n        border-color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-light .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-light .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-light .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #e8e8e8;\n        color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-light .navbar-dropdown a.navbar-item.is-active {\n        background-color: whitesmoke;\n        color: rgba(0, 0, 0, 0.7); } }\n  .navbar.is-dark {\n    background-color: #353A48;\n    color: #fff; }\n    .navbar.is-dark .navbar-brand > .navbar-item,\n    .navbar.is-dark .navbar-brand .navbar-link {\n      color: #fff; }\n    .navbar.is-dark .navbar-brand > a.navbar-item:focus, .navbar.is-dark .navbar-brand > a.navbar-item:hover, .navbar.is-dark .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-dark .navbar-brand .navbar-link:focus,\n    .navbar.is-dark .navbar-brand .navbar-link:hover,\n    .navbar.is-dark .navbar-brand .navbar-link.is-active {\n      background-color: #2a2e39;\n      color: #fff; }\n    .navbar.is-dark .navbar-brand .navbar-link::after {\n      border-color: #fff; }\n    .navbar.is-dark .navbar-burger {\n      color: #fff; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-dark .navbar-start > .navbar-item,\n      .navbar.is-dark .navbar-start .navbar-link,\n      .navbar.is-dark .navbar-end > .navbar-item,\n      .navbar.is-dark .navbar-end .navbar-link {\n        color: #fff; }\n      .navbar.is-dark .navbar-start > a.navbar-item:focus, .navbar.is-dark .navbar-start > a.navbar-item:hover, .navbar.is-dark .navbar-start > a.navbar-item.is-active,\n      .navbar.is-dark .navbar-start .navbar-link:focus,\n      .navbar.is-dark .navbar-start .navbar-link:hover,\n      .navbar.is-dark .navbar-start .navbar-link.is-active,\n      .navbar.is-dark .navbar-end > a.navbar-item:focus,\n      .navbar.is-dark .navbar-end > a.navbar-item:hover,\n      .navbar.is-dark .navbar-end > a.navbar-item.is-active,\n      .navbar.is-dark .navbar-end .navbar-link:focus,\n      .navbar.is-dark .navbar-end .navbar-link:hover,\n      .navbar.is-dark .navbar-end .navbar-link.is-active {\n        background-color: #2a2e39;\n        color: #fff; }\n      .navbar.is-dark .navbar-start .navbar-link::after,\n      .navbar.is-dark .navbar-end .navbar-link::after {\n        border-color: #fff; }\n      .navbar.is-dark .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-dark .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-dark .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #2a2e39;\n        color: #fff; }\n      .navbar.is-dark .navbar-dropdown a.navbar-item.is-active {\n        background-color: #353A48;\n        color: #fff; } }\n  .navbar.is-primary {\n    background-color: #74BE43;\n    color: #fff; }\n    .navbar.is-primary .navbar-brand > .navbar-item,\n    .navbar.is-primary .navbar-brand .navbar-link {\n      color: #fff; }\n    .navbar.is-primary .navbar-brand > a.navbar-item:focus, .navbar.is-primary .navbar-brand > a.navbar-item:hover, .navbar.is-primary .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-primary .navbar-brand .navbar-link:focus,\n    .navbar.is-primary .navbar-brand .navbar-link:hover,\n    .navbar.is-primary .navbar-brand .navbar-link.is-active {\n      background-color: #68ac3b;\n      color: #fff; }\n    .navbar.is-primary .navbar-brand .navbar-link::after {\n      border-color: #fff; }\n    .navbar.is-primary .navbar-burger {\n      color: #fff; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-primary .navbar-start > .navbar-item,\n      .navbar.is-primary .navbar-start .navbar-link,\n      .navbar.is-primary .navbar-end > .navbar-item,\n      .navbar.is-primary .navbar-end .navbar-link {\n        color: #fff; }\n      .navbar.is-primary .navbar-start > a.navbar-item:focus, .navbar.is-primary .navbar-start > a.navbar-item:hover, .navbar.is-primary .navbar-start > a.navbar-item.is-active,\n      .navbar.is-primary .navbar-start .navbar-link:focus,\n      .navbar.is-primary .navbar-start .navbar-link:hover,\n      .navbar.is-primary .navbar-start .navbar-link.is-active,\n      .navbar.is-primary .navbar-end > a.navbar-item:focus,\n      .navbar.is-primary .navbar-end > a.navbar-item:hover,\n      .navbar.is-primary .navbar-end > a.navbar-item.is-active,\n      .navbar.is-primary .navbar-end .navbar-link:focus,\n      .navbar.is-primary .navbar-end .navbar-link:hover,\n      .navbar.is-primary .navbar-end .navbar-link.is-active {\n        background-color: #68ac3b;\n        color: #fff; }\n      .navbar.is-primary .navbar-start .navbar-link::after,\n      .navbar.is-primary .navbar-end .navbar-link::after {\n        border-color: #fff; }\n      .navbar.is-primary .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-primary .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-primary .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #68ac3b;\n        color: #fff; }\n      .navbar.is-primary .navbar-dropdown a.navbar-item.is-active {\n        background-color: #74BE43;\n        color: #fff; } }\n  .navbar.is-link {\n    background-color: #3273dc;\n    color: #fff; }\n    .navbar.is-link .navbar-brand > .navbar-item,\n    .navbar.is-link .navbar-brand .navbar-link {\n      color: #fff; }\n    .navbar.is-link .navbar-brand > a.navbar-item:focus, .navbar.is-link .navbar-brand > a.navbar-item:hover, .navbar.is-link .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-link .navbar-brand .navbar-link:focus,\n    .navbar.is-link .navbar-brand .navbar-link:hover,\n    .navbar.is-link .navbar-brand .navbar-link.is-active {\n      background-color: #2366d1;\n      color: #fff; }\n    .navbar.is-link .navbar-brand .navbar-link::after {\n      border-color: #fff; }\n    .navbar.is-link .navbar-burger {\n      color: #fff; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-link .navbar-start > .navbar-item,\n      .navbar.is-link .navbar-start .navbar-link,\n      .navbar.is-link .navbar-end > .navbar-item,\n      .navbar.is-link .navbar-end .navbar-link {\n        color: #fff; }\n      .navbar.is-link .navbar-start > a.navbar-item:focus, .navbar.is-link .navbar-start > a.navbar-item:hover, .navbar.is-link .navbar-start > a.navbar-item.is-active,\n      .navbar.is-link .navbar-start .navbar-link:focus,\n      .navbar.is-link .navbar-start .navbar-link:hover,\n      .navbar.is-link .navbar-start .navbar-link.is-active,\n      .navbar.is-link .navbar-end > a.navbar-item:focus,\n      .navbar.is-link .navbar-end > a.navbar-item:hover,\n      .navbar.is-link .navbar-end > a.navbar-item.is-active,\n      .navbar.is-link .navbar-end .navbar-link:focus,\n      .navbar.is-link .navbar-end .navbar-link:hover,\n      .navbar.is-link .navbar-end .navbar-link.is-active {\n        background-color: #2366d1;\n        color: #fff; }\n      .navbar.is-link .navbar-start .navbar-link::after,\n      .navbar.is-link .navbar-end .navbar-link::after {\n        border-color: #fff; }\n      .navbar.is-link .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-link .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-link .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #2366d1;\n        color: #fff; }\n      .navbar.is-link .navbar-dropdown a.navbar-item.is-active {\n        background-color: #3273dc;\n        color: #fff; } }\n  .navbar.is-info {\n    background-color: #3298dc;\n    color: #fff; }\n    .navbar.is-info .navbar-brand > .navbar-item,\n    .navbar.is-info .navbar-brand .navbar-link {\n      color: #fff; }\n    .navbar.is-info .navbar-brand > a.navbar-item:focus, .navbar.is-info .navbar-brand > a.navbar-item:hover, .navbar.is-info .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-info .navbar-brand .navbar-link:focus,\n    .navbar.is-info .navbar-brand .navbar-link:hover,\n    .navbar.is-info .navbar-brand .navbar-link.is-active {\n      background-color: #238cd1;\n      color: #fff; }\n    .navbar.is-info .navbar-brand .navbar-link::after {\n      border-color: #fff; }\n    .navbar.is-info .navbar-burger {\n      color: #fff; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-info .navbar-start > .navbar-item,\n      .navbar.is-info .navbar-start .navbar-link,\n      .navbar.is-info .navbar-end > .navbar-item,\n      .navbar.is-info .navbar-end .navbar-link {\n        color: #fff; }\n      .navbar.is-info .navbar-start > a.navbar-item:focus, .navbar.is-info .navbar-start > a.navbar-item:hover, .navbar.is-info .navbar-start > a.navbar-item.is-active,\n      .navbar.is-info .navbar-start .navbar-link:focus,\n      .navbar.is-info .navbar-start .navbar-link:hover,\n      .navbar.is-info .navbar-start .navbar-link.is-active,\n      .navbar.is-info .navbar-end > a.navbar-item:focus,\n      .navbar.is-info .navbar-end > a.navbar-item:hover,\n      .navbar.is-info .navbar-end > a.navbar-item.is-active,\n      .navbar.is-info .navbar-end .navbar-link:focus,\n      .navbar.is-info .navbar-end .navbar-link:hover,\n      .navbar.is-info .navbar-end .navbar-link.is-active {\n        background-color: #238cd1;\n        color: #fff; }\n      .navbar.is-info .navbar-start .navbar-link::after,\n      .navbar.is-info .navbar-end .navbar-link::after {\n        border-color: #fff; }\n      .navbar.is-info .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-info .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-info .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #238cd1;\n        color: #fff; }\n      .navbar.is-info .navbar-dropdown a.navbar-item.is-active {\n        background-color: #3298dc;\n        color: #fff; } }\n  .navbar.is-success {\n    background-color: #74BE43;\n    color: #fff; }\n    .navbar.is-success .navbar-brand > .navbar-item,\n    .navbar.is-success .navbar-brand .navbar-link {\n      color: #fff; }\n    .navbar.is-success .navbar-brand > a.navbar-item:focus, .navbar.is-success .navbar-brand > a.navbar-item:hover, .navbar.is-success .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-success .navbar-brand .navbar-link:focus,\n    .navbar.is-success .navbar-brand .navbar-link:hover,\n    .navbar.is-success .navbar-brand .navbar-link.is-active {\n      background-color: #68ac3b;\n      color: #fff; }\n    .navbar.is-success .navbar-brand .navbar-link::after {\n      border-color: #fff; }\n    .navbar.is-success .navbar-burger {\n      color: #fff; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-success .navbar-start > .navbar-item,\n      .navbar.is-success .navbar-start .navbar-link,\n      .navbar.is-success .navbar-end > .navbar-item,\n      .navbar.is-success .navbar-end .navbar-link {\n        color: #fff; }\n      .navbar.is-success .navbar-start > a.navbar-item:focus, .navbar.is-success .navbar-start > a.navbar-item:hover, .navbar.is-success .navbar-start > a.navbar-item.is-active,\n      .navbar.is-success .navbar-start .navbar-link:focus,\n      .navbar.is-success .navbar-start .navbar-link:hover,\n      .navbar.is-success .navbar-start .navbar-link.is-active,\n      .navbar.is-success .navbar-end > a.navbar-item:focus,\n      .navbar.is-success .navbar-end > a.navbar-item:hover,\n      .navbar.is-success .navbar-end > a.navbar-item.is-active,\n      .navbar.is-success .navbar-end .navbar-link:focus,\n      .navbar.is-success .navbar-end .navbar-link:hover,\n      .navbar.is-success .navbar-end .navbar-link.is-active {\n        background-color: #68ac3b;\n        color: #fff; }\n      .navbar.is-success .navbar-start .navbar-link::after,\n      .navbar.is-success .navbar-end .navbar-link::after {\n        border-color: #fff; }\n      .navbar.is-success .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-success .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-success .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #68ac3b;\n        color: #fff; }\n      .navbar.is-success .navbar-dropdown a.navbar-item.is-active {\n        background-color: #74BE43;\n        color: #fff; } }\n  .navbar.is-warning {\n    background-color: #ffdd57;\n    color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-warning .navbar-brand > .navbar-item,\n    .navbar.is-warning .navbar-brand .navbar-link {\n      color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-warning .navbar-brand > a.navbar-item:focus, .navbar.is-warning .navbar-brand > a.navbar-item:hover, .navbar.is-warning .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-warning .navbar-brand .navbar-link:focus,\n    .navbar.is-warning .navbar-brand .navbar-link:hover,\n    .navbar.is-warning .navbar-brand .navbar-link.is-active {\n      background-color: #ffd83d;\n      color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-warning .navbar-brand .navbar-link::after {\n      border-color: rgba(0, 0, 0, 0.7); }\n    .navbar.is-warning .navbar-burger {\n      color: rgba(0, 0, 0, 0.7); }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-warning .navbar-start > .navbar-item,\n      .navbar.is-warning .navbar-start .navbar-link,\n      .navbar.is-warning .navbar-end > .navbar-item,\n      .navbar.is-warning .navbar-end .navbar-link {\n        color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-warning .navbar-start > a.navbar-item:focus, .navbar.is-warning .navbar-start > a.navbar-item:hover, .navbar.is-warning .navbar-start > a.navbar-item.is-active,\n      .navbar.is-warning .navbar-start .navbar-link:focus,\n      .navbar.is-warning .navbar-start .navbar-link:hover,\n      .navbar.is-warning .navbar-start .navbar-link.is-active,\n      .navbar.is-warning .navbar-end > a.navbar-item:focus,\n      .navbar.is-warning .navbar-end > a.navbar-item:hover,\n      .navbar.is-warning .navbar-end > a.navbar-item.is-active,\n      .navbar.is-warning .navbar-end .navbar-link:focus,\n      .navbar.is-warning .navbar-end .navbar-link:hover,\n      .navbar.is-warning .navbar-end .navbar-link.is-active {\n        background-color: #ffd83d;\n        color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-warning .navbar-start .navbar-link::after,\n      .navbar.is-warning .navbar-end .navbar-link::after {\n        border-color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-warning .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-warning .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-warning .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #ffd83d;\n        color: rgba(0, 0, 0, 0.7); }\n      .navbar.is-warning .navbar-dropdown a.navbar-item.is-active {\n        background-color: #ffdd57;\n        color: rgba(0, 0, 0, 0.7); } }\n  .navbar.is-danger {\n    background-color: #f14668;\n    color: #fff; }\n    .navbar.is-danger .navbar-brand > .navbar-item,\n    .navbar.is-danger .navbar-brand .navbar-link {\n      color: #fff; }\n    .navbar.is-danger .navbar-brand > a.navbar-item:focus, .navbar.is-danger .navbar-brand > a.navbar-item:hover, .navbar.is-danger .navbar-brand > a.navbar-item.is-active,\n    .navbar.is-danger .navbar-brand .navbar-link:focus,\n    .navbar.is-danger .navbar-brand .navbar-link:hover,\n    .navbar.is-danger .navbar-brand .navbar-link.is-active {\n      background-color: #ef2e55;\n      color: #fff; }\n    .navbar.is-danger .navbar-brand .navbar-link::after {\n      border-color: #fff; }\n    .navbar.is-danger .navbar-burger {\n      color: #fff; }\n    @media screen and (min-width: 1024px) {\n      .navbar.is-danger .navbar-start > .navbar-item,\n      .navbar.is-danger .navbar-start .navbar-link,\n      .navbar.is-danger .navbar-end > .navbar-item,\n      .navbar.is-danger .navbar-end .navbar-link {\n        color: #fff; }\n      .navbar.is-danger .navbar-start > a.navbar-item:focus, .navbar.is-danger .navbar-start > a.navbar-item:hover, .navbar.is-danger .navbar-start > a.navbar-item.is-active,\n      .navbar.is-danger .navbar-start .navbar-link:focus,\n      .navbar.is-danger .navbar-start .navbar-link:hover,\n      .navbar.is-danger .navbar-start .navbar-link.is-active,\n      .navbar.is-danger .navbar-end > a.navbar-item:focus,\n      .navbar.is-danger .navbar-end > a.navbar-item:hover,\n      .navbar.is-danger .navbar-end > a.navbar-item.is-active,\n      .navbar.is-danger .navbar-end .navbar-link:focus,\n      .navbar.is-danger .navbar-end .navbar-link:hover,\n      .navbar.is-danger .navbar-end .navbar-link.is-active {\n        background-color: #ef2e55;\n        color: #fff; }\n      .navbar.is-danger .navbar-start .navbar-link::after,\n      .navbar.is-danger .navbar-end .navbar-link::after {\n        border-color: #fff; }\n      .navbar.is-danger .navbar-item.has-dropdown:focus .navbar-link,\n      .navbar.is-danger .navbar-item.has-dropdown:hover .navbar-link,\n      .navbar.is-danger .navbar-item.has-dropdown.is-active .navbar-link {\n        background-color: #ef2e55;\n        color: #fff; }\n      .navbar.is-danger .navbar-dropdown a.navbar-item.is-active {\n        background-color: #f14668;\n        color: #fff; } }\n  .navbar > .container {\n    align-items: stretch;\n    display: flex;\n    min-height: 3.25rem;\n    width: 100%; }\n  .navbar.has-shadow {\n    box-shadow: 0 2px 0 0 whitesmoke; }\n  .navbar.is-fixed-bottom, .navbar.is-fixed-top {\n    left: 0;\n    position: fixed;\n    right: 0;\n    z-index: 30; }\n  .navbar.is-fixed-bottom {\n    bottom: 0; }\n    .navbar.is-fixed-bottom.has-shadow {\n      box-shadow: 0 -2px 0 0 whitesmoke; }\n  .navbar.is-fixed-top {\n    top: 0; }\n\nhtml.has-navbar-fixed-top,\nbody.has-navbar-fixed-top {\n  padding-top: 3.25rem; }\n\nhtml.has-navbar-fixed-bottom,\nbody.has-navbar-fixed-bottom {\n  padding-bottom: 3.25rem; }\n\n.navbar-brand,\n.navbar-tabs {\n  align-items: stretch;\n  display: flex;\n  flex-shrink: 0;\n  min-height: 3.25rem; }\n\n.navbar-brand a.navbar-item:focus, .navbar-brand a.navbar-item:hover {\n  background-color: transparent; }\n\n.navbar-tabs {\n  -webkit-overflow-scrolling: touch;\n  max-width: 100vw;\n  overflow-x: auto;\n  overflow-y: hidden; }\n\n.navbar-burger {\n  color: #4a4a4a;\n  cursor: pointer;\n  display: block;\n  height: 3.25rem;\n  position: relative;\n  width: 3.25rem;\n  margin-left: auto; }\n  .navbar-burger span {\n    background-color: currentColor;\n    display: block;\n    height: 1px;\n    left: calc(50% - 8px);\n    position: absolute;\n    transform-origin: center;\n    transition-duration: 86ms;\n    transition-property: background-color, opacity, transform;\n    transition-timing-function: ease-out;\n    width: 16px; }\n    .navbar-burger span:nth-child(1) {\n      top: calc(50% - 6px); }\n    .navbar-burger span:nth-child(2) {\n      top: calc(50% - 1px); }\n    .navbar-burger span:nth-child(3) {\n      top: calc(50% + 4px); }\n  .navbar-burger:hover {\n    background-color: rgba(0, 0, 0, 0.05); }\n  .navbar-burger.is-active span:nth-child(1) {\n    transform: translateY(5px) rotate(45deg); }\n  .navbar-burger.is-active span:nth-child(2) {\n    opacity: 0; }\n  .navbar-burger.is-active span:nth-child(3) {\n    transform: translateY(-5px) rotate(-45deg); }\n\n.navbar-menu {\n  display: none; }\n\n.navbar-item,\n.navbar-link {\n  color: #4a4a4a;\n  display: block;\n  line-height: 1.5;\n  padding: 0.5rem 0.75rem;\n  position: relative; }\n  .navbar-item .icon:only-child,\n  .navbar-link .icon:only-child {\n    margin-left: -0.25rem;\n    margin-right: -0.25rem; }\n\na.navbar-item,\n.navbar-link {\n  cursor: pointer; }\n  a.navbar-item:focus, a.navbar-item:focus-within, a.navbar-item:hover, a.navbar-item.is-active,\n  .navbar-link:focus,\n  .navbar-link:focus-within,\n  .navbar-link:hover,\n  .navbar-link.is-active {\n    background-color: #fafafa;\n    color: #3273dc; }\n\n.navbar-item {\n  display: block;\n  flex-grow: 0;\n  flex-shrink: 0; }\n  .navbar-item img {\n    max-height: 1.75rem; }\n  .navbar-item.has-dropdown {\n    padding: 0; }\n  .navbar-item.is-expanded {\n    flex-grow: 1;\n    flex-shrink: 1; }\n  .navbar-item.is-tab {\n    border-bottom: 1px solid transparent;\n    min-height: 3.25rem;\n    padding-bottom: calc(0.5rem - 1px); }\n    .navbar-item.is-tab:focus, .navbar-item.is-tab:hover {\n      background-color: transparent;\n      border-bottom-color: #3273dc; }\n    .navbar-item.is-tab.is-active {\n      background-color: transparent;\n      border-bottom-color: #3273dc;\n      border-bottom-style: solid;\n      border-bottom-width: 3px;\n      color: #3273dc;\n      padding-bottom: calc(0.5rem - 3px); }\n\n.navbar-content {\n  flex-grow: 1;\n  flex-shrink: 1; }\n\n.navbar-link:not(.is-arrowless) {\n  padding-right: 2.5em; }\n  .navbar-link:not(.is-arrowless)::after {\n    border-color: #3273dc;\n    margin-top: -0.375em;\n    right: 1.125em; }\n\n.navbar-dropdown {\n  font-size: 0.875rem;\n  padding-bottom: 0.5rem;\n  padding-top: 0.5rem; }\n  .navbar-dropdown .navbar-item {\n    padding-left: 1.5rem;\n    padding-right: 1.5rem; }\n\n.navbar-divider {\n  background-color: whitesmoke;\n  border: none;\n  display: none;\n  height: 2px;\n  margin: 0.5rem 0; }\n\n@media screen and (max-width: 1023px) {\n  .navbar > .container {\n    display: block; }\n  .navbar-brand .navbar-item,\n  .navbar-tabs .navbar-item {\n    align-items: center;\n    display: flex; }\n  .navbar-link::after {\n    display: none; }\n  .navbar-menu {\n    background-color: white;\n    box-shadow: 0 8px 16px rgba(10, 10, 10, 0.1);\n    padding: 0.5rem 0; }\n    .navbar-menu.is-active {\n      display: block; }\n  .navbar.is-fixed-bottom-touch, .navbar.is-fixed-top-touch {\n    left: 0;\n    position: fixed;\n    right: 0;\n    z-index: 30; }\n  .navbar.is-fixed-bottom-touch {\n    bottom: 0; }\n    .navbar.is-fixed-bottom-touch.has-shadow {\n      box-shadow: 0 -2px 3px rgba(10, 10, 10, 0.1); }\n  .navbar.is-fixed-top-touch {\n    top: 0; }\n  .navbar.is-fixed-top .navbar-menu, .navbar.is-fixed-top-touch .navbar-menu {\n    -webkit-overflow-scrolling: touch;\n    max-height: calc(100vh - 3.25rem);\n    overflow: auto; }\n  html.has-navbar-fixed-top-touch,\n  body.has-navbar-fixed-top-touch {\n    padding-top: 3.25rem; }\n  html.has-navbar-fixed-bottom-touch,\n  body.has-navbar-fixed-bottom-touch {\n    padding-bottom: 3.25rem; } }\n\n@media screen and (min-width: 1024px) {\n  .navbar,\n  .navbar-menu,\n  .navbar-start,\n  .navbar-end {\n    align-items: stretch;\n    display: flex; }\n  .navbar {\n    min-height: 3.25rem; }\n    .navbar.is-spaced {\n      padding: 1rem 2rem; }\n      .navbar.is-spaced .navbar-start,\n      .navbar.is-spaced .navbar-end {\n        align-items: center; }\n      .navbar.is-spaced a.navbar-item,\n      .navbar.is-spaced .navbar-link {\n        border-radius: 4px; }\n    .navbar.is-transparent a.navbar-item:focus, .navbar.is-transparent a.navbar-item:hover, .navbar.is-transparent a.navbar-item.is-active,\n    .navbar.is-transparent .navbar-link:focus,\n    .navbar.is-transparent .navbar-link:hover,\n    .navbar.is-transparent .navbar-link.is-active {\n      background-color: transparent !important; }\n    .navbar.is-transparent .navbar-item.has-dropdown.is-active .navbar-link, .navbar.is-transparent .navbar-item.has-dropdown.is-hoverable:focus .navbar-link, .navbar.is-transparent .navbar-item.has-dropdown.is-hoverable:focus-within .navbar-link, .navbar.is-transparent .navbar-item.has-dropdown.is-hoverable:hover .navbar-link {\n      background-color: transparent !important; }\n    .navbar.is-transparent .navbar-dropdown a.navbar-item:focus, .navbar.is-transparent .navbar-dropdown a.navbar-item:hover {\n      background-color: whitesmoke;\n      color: #0a0a0a; }\n    .navbar.is-transparent .navbar-dropdown a.navbar-item.is-active {\n      background-color: whitesmoke;\n      color: #3273dc; }\n  .navbar-burger {\n    display: none; }\n  .navbar-item,\n  .navbar-link {\n    align-items: center;\n    display: flex; }\n  .navbar-item {\n    display: flex; }\n    .navbar-item.has-dropdown {\n      align-items: stretch; }\n    .navbar-item.has-dropdown-up .navbar-link::after {\n      transform: rotate(135deg) translate(0.25em, -0.25em); }\n    .navbar-item.has-dropdown-up .navbar-dropdown {\n      border-bottom: 2px solid #dbdbdb;\n      border-radius: 6px 6px 0 0;\n      border-top: none;\n      bottom: 100%;\n      box-shadow: 0 -8px 8px rgba(10, 10, 10, 0.1);\n      top: auto; }\n    .navbar-item.is-active .navbar-dropdown, .navbar-item.is-hoverable:focus .navbar-dropdown, .navbar-item.is-hoverable:focus-within .navbar-dropdown, .navbar-item.is-hoverable:hover .navbar-dropdown {\n      display: block; }\n      .navbar.is-spaced .navbar-item.is-active .navbar-dropdown, .navbar-item.is-active .navbar-dropdown.is-boxed, .navbar.is-spaced .navbar-item.is-hoverable:focus .navbar-dropdown, .navbar-item.is-hoverable:focus .navbar-dropdown.is-boxed, .navbar.is-spaced .navbar-item.is-hoverable:focus-within .navbar-dropdown, .navbar-item.is-hoverable:focus-within .navbar-dropdown.is-boxed, .navbar.is-spaced .navbar-item.is-hoverable:hover .navbar-dropdown, .navbar-item.is-hoverable:hover .navbar-dropdown.is-boxed {\n        opacity: 1;\n        pointer-events: auto;\n        transform: translateY(0); }\n  .navbar-menu {\n    flex-grow: 1;\n    flex-shrink: 0; }\n  .navbar-start {\n    justify-content: flex-start;\n    margin-right: auto; }\n  .navbar-end {\n    justify-content: flex-end;\n    margin-left: auto; }\n  .navbar-dropdown {\n    background-color: white;\n    border-bottom-left-radius: 6px;\n    border-bottom-right-radius: 6px;\n    border-top: 2px solid #dbdbdb;\n    box-shadow: 0 8px 8px rgba(10, 10, 10, 0.1);\n    display: none;\n    font-size: 0.875rem;\n    left: 0;\n    min-width: 100%;\n    position: absolute;\n    top: 100%;\n    z-index: 20; }\n    .navbar-dropdown .navbar-item {\n      padding: 0.375rem 1rem;\n      white-space: nowrap; }\n    .navbar-dropdown a.navbar-item {\n      padding-right: 3rem; }\n      .navbar-dropdown a.navbar-item:focus, .navbar-dropdown a.navbar-item:hover {\n        background-color: whitesmoke;\n        color: #0a0a0a; }\n      .navbar-dropdown a.navbar-item.is-active {\n        background-color: whitesmoke;\n        color: #3273dc; }\n    .navbar.is-spaced .navbar-dropdown, .navbar-dropdown.is-boxed {\n      border-radius: 6px;\n      border-top: none;\n      box-shadow: 0 8px 8px rgba(10, 10, 10, 0.1), 0 0 0 1px rgba(10, 10, 10, 0.1);\n      display: block;\n      opacity: 0;\n      pointer-events: none;\n      top: calc(100% + (-4px));\n      transform: translateY(-5px);\n      transition-duration: 86ms;\n      transition-property: opacity, transform; }\n    .navbar-dropdown.is-right {\n      left: auto;\n      right: 0; }\n  .navbar-divider {\n    display: block; }\n  .navbar > .container .navbar-brand,\n  .container > .navbar .navbar-brand {\n    margin-left: -.75rem; }\n  .navbar > .container .navbar-menu,\n  .container > .navbar .navbar-menu {\n    margin-right: -.75rem; }\n  .navbar.is-fixed-bottom-desktop, .navbar.is-fixed-top-desktop {\n    left: 0;\n    position: fixed;\n    right: 0;\n    z-index: 30; }\n  .navbar.is-fixed-bottom-desktop {\n    bottom: 0; }\n    .navbar.is-fixed-bottom-desktop.has-shadow {\n      box-shadow: 0 -2px 3px rgba(10, 10, 10, 0.1); }\n  .navbar.is-fixed-top-desktop {\n    top: 0; }\n  html.has-navbar-fixed-top-desktop,\n  body.has-navbar-fixed-top-desktop {\n    padding-top: 3.25rem; }\n  html.has-navbar-fixed-bottom-desktop,\n  body.has-navbar-fixed-bottom-desktop {\n    padding-bottom: 3.25rem; }\n  html.has-spaced-navbar-fixed-top,\n  body.has-spaced-navbar-fixed-top {\n    padding-top: 5.25rem; }\n  html.has-spaced-navbar-fixed-bottom,\n  body.has-spaced-navbar-fixed-bottom {\n    padding-bottom: 5.25rem; }\n  a.navbar-item.is-active,\n  .navbar-link.is-active {\n    color: #0a0a0a; }\n  a.navbar-item.is-active:not(:focus):not(:hover),\n  .navbar-link.is-active:not(:focus):not(:hover) {\n    background-color: transparent; }\n  .navbar-item.has-dropdown:focus .navbar-link, .navbar-item.has-dropdown:hover .navbar-link, .navbar-item.has-dropdown.is-active .navbar-link {\n    background-color: #fafafa; } }\n\n.hero.is-fullheight-with-navbar {\n  min-height: calc(100vh - 3.25rem); }\n\n.pagination {\n  font-size: 1rem;\n  margin: -0.25rem; }\n  .pagination.is-small {\n    font-size: 0.75rem; }\n  .pagination.is-medium {\n    font-size: 1.25rem; }\n  .pagination.is-large {\n    font-size: 1.5rem; }\n  .pagination.is-rounded .pagination-previous,\n  .pagination.is-rounded .pagination-next {\n    padding-left: 1em;\n    padding-right: 1em;\n    border-radius: 290486px; }\n  .pagination.is-rounded .pagination-link {\n    border-radius: 290486px; }\n\n.pagination,\n.pagination-list {\n  align-items: center;\n  display: flex;\n  justify-content: center;\n  text-align: center; }\n\n.pagination-previous,\n.pagination-next,\n.pagination-link,\n.pagination-ellipsis {\n  font-size: 1em;\n  justify-content: center;\n  margin: 0.25rem;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n  text-align: center; }\n\n.pagination-previous,\n.pagination-next,\n.pagination-link {\n  border-color: #dbdbdb;\n  color: #363636;\n  min-width: 2.5em; }\n  .pagination-previous:hover,\n  .pagination-next:hover,\n  .pagination-link:hover {\n    border-color: #b5b5b5;\n    color: #363636; }\n  .pagination-previous:focus,\n  .pagination-next:focus,\n  .pagination-link:focus {\n    border-color: #3273dc; }\n  .pagination-previous:active,\n  .pagination-next:active,\n  .pagination-link:active {\n    box-shadow: inset 0 1px 2px rgba(10, 10, 10, 0.2); }\n  .pagination-previous[disabled],\n  .pagination-next[disabled],\n  .pagination-link[disabled] {\n    background-color: #dbdbdb;\n    border-color: #dbdbdb;\n    box-shadow: none;\n    color: #7a7a7a;\n    opacity: 0.5; }\n\n.pagination-previous,\n.pagination-next {\n  padding-left: 0.75em;\n  padding-right: 0.75em;\n  white-space: nowrap; }\n\n.pagination-link.is-current {\n  background-color: #3273dc;\n  border-color: #3273dc;\n  color: #fff; }\n\n.pagination-ellipsis {\n  color: #b5b5b5;\n  pointer-events: none; }\n\n.pagination-list {\n  flex-wrap: wrap; }\n\n@media screen and (max-width: 768px) {\n  .pagination {\n    flex-wrap: wrap; }\n  .pagination-previous,\n  .pagination-next {\n    flex-grow: 1;\n    flex-shrink: 1; }\n  .pagination-list li {\n    flex-grow: 1;\n    flex-shrink: 1; } }\n\n@media screen and (min-width: 769px), print {\n  .pagination-list {\n    flex-grow: 1;\n    flex-shrink: 1;\n    justify-content: flex-start;\n    order: 1; }\n  .pagination-previous {\n    order: 2; }\n  .pagination-next {\n    order: 3; }\n  .pagination {\n    justify-content: space-between; }\n    .pagination.is-centered .pagination-previous {\n      order: 1; }\n    .pagination.is-centered .pagination-list {\n      justify-content: center;\n      order: 2; }\n    .pagination.is-centered .pagination-next {\n      order: 3; }\n    .pagination.is-right .pagination-previous {\n      order: 1; }\n    .pagination.is-right .pagination-next {\n      order: 2; }\n    .pagination.is-right .pagination-list {\n      justify-content: flex-end;\n      order: 3; } }\n\n.panel {\n  border-radius: 6px;\n  box-shadow: 0 0.5em 1em -0.125em rgba(10, 10, 10, 0.1), 0 0px 0 1px rgba(10, 10, 10, 0.02);\n  font-size: 1rem; }\n  .panel:not(:last-child) {\n    margin-bottom: 1.5rem; }\n  .panel.is-white .panel-heading {\n    background-color: white;\n    color: #0a0a0a; }\n  .panel.is-white .panel-tabs a.is-active {\n    border-bottom-color: white; }\n  .panel.is-white .panel-block.is-active .panel-icon {\n    color: white; }\n  .panel.is-black .panel-heading {\n    background-color: #0a0a0a;\n    color: white; }\n  .panel.is-black .panel-tabs a.is-active {\n    border-bottom-color: #0a0a0a; }\n  .panel.is-black .panel-block.is-active .panel-icon {\n    color: #0a0a0a; }\n  .panel.is-light .panel-heading {\n    background-color: whitesmoke;\n    color: rgba(0, 0, 0, 0.7); }\n  .panel.is-light .panel-tabs a.is-active {\n    border-bottom-color: whitesmoke; }\n  .panel.is-light .panel-block.is-active .panel-icon {\n    color: whitesmoke; }\n  .panel.is-dark .panel-heading {\n    background-color: #353A48;\n    color: #fff; }\n  .panel.is-dark .panel-tabs a.is-active {\n    border-bottom-color: #353A48; }\n  .panel.is-dark .panel-block.is-active .panel-icon {\n    color: #353A48; }\n  .panel.is-primary .panel-heading {\n    background-color: #74BE43;\n    color: #fff; }\n  .panel.is-primary .panel-tabs a.is-active {\n    border-bottom-color: #74BE43; }\n  .panel.is-primary .panel-block.is-active .panel-icon {\n    color: #74BE43; }\n  .panel.is-link .panel-heading {\n    background-color: #3273dc;\n    color: #fff; }\n  .panel.is-link .panel-tabs a.is-active {\n    border-bottom-color: #3273dc; }\n  .panel.is-link .panel-block.is-active .panel-icon {\n    color: #3273dc; }\n  .panel.is-info .panel-heading {\n    background-color: #3298dc;\n    color: #fff; }\n  .panel.is-info .panel-tabs a.is-active {\n    border-bottom-color: #3298dc; }\n  .panel.is-info .panel-block.is-active .panel-icon {\n    color: #3298dc; }\n  .panel.is-success .panel-heading {\n    background-color: #74BE43;\n    color: #fff; }\n  .panel.is-success .panel-tabs a.is-active {\n    border-bottom-color: #74BE43; }\n  .panel.is-success .panel-block.is-active .panel-icon {\n    color: #74BE43; }\n  .panel.is-warning .panel-heading {\n    background-color: #ffdd57;\n    color: rgba(0, 0, 0, 0.7); }\n  .panel.is-warning .panel-tabs a.is-active {\n    border-bottom-color: #ffdd57; }\n  .panel.is-warning .panel-block.is-active .panel-icon {\n    color: #ffdd57; }\n  .panel.is-danger .panel-heading {\n    background-color: #f14668;\n    color: #fff; }\n  .panel.is-danger .panel-tabs a.is-active {\n    border-bottom-color: #f14668; }\n  .panel.is-danger .panel-block.is-active .panel-icon {\n    color: #f14668; }\n\n.panel-tabs:not(:last-child),\n.panel-block:not(:last-child) {\n  border-bottom: 1px solid #ededed; }\n\n.panel-heading {\n  background-color: #ededed;\n  border-radius: 6px 6px 0 0;\n  color: #363636;\n  font-size: 1.25em;\n  font-weight: 700;\n  line-height: 1.25;\n  padding: 0.75em 1em; }\n\n.panel-tabs {\n  align-items: flex-end;\n  display: flex;\n  font-size: 0.875em;\n  justify-content: center; }\n  .panel-tabs a {\n    border-bottom: 1px solid #dbdbdb;\n    margin-bottom: -1px;\n    padding: 0.5em; }\n    .panel-tabs a.is-active {\n      border-bottom-color: #4a4a4a;\n      color: #363636; }\n\n.panel-list a {\n  color: #4a4a4a; }\n  .panel-list a:hover {\n    color: #3273dc; }\n\n.panel-block {\n  align-items: center;\n  color: #363636;\n  display: flex;\n  justify-content: flex-start;\n  padding: 0.5em 0.75em; }\n  .panel-block input[type=\"checkbox\"] {\n    margin-right: 0.75em; }\n  .panel-block > .control {\n    flex-grow: 1;\n    flex-shrink: 1;\n    width: 100%; }\n  .panel-block.is-wrapped {\n    flex-wrap: wrap; }\n  .panel-block.is-active {\n    border-left-color: #3273dc;\n    color: #363636; }\n    .panel-block.is-active .panel-icon {\n      color: #3273dc; }\n  .panel-block:last-child {\n    border-bottom-left-radius: 6px;\n    border-bottom-right-radius: 6px; }\n\na.panel-block,\nlabel.panel-block {\n  cursor: pointer; }\n  a.panel-block:hover,\n  label.panel-block:hover {\n    background-color: whitesmoke; }\n\n.panel-icon {\n  display: inline-block;\n  font-size: 14px;\n  height: 1em;\n  line-height: 1em;\n  text-align: center;\n  vertical-align: top;\n  width: 1em;\n  color: #7a7a7a;\n  margin-right: 0.75em; }\n  .panel-icon .fa {\n    font-size: inherit;\n    line-height: inherit; }\n\n.tabs {\n  -webkit-overflow-scrolling: touch;\n  align-items: stretch;\n  display: flex;\n  font-size: 1rem;\n  justify-content: space-between;\n  overflow: hidden;\n  overflow-x: auto;\n  white-space: nowrap; }\n  .tabs a {\n    align-items: center;\n    border-bottom-color: #dbdbdb;\n    border-bottom-style: solid;\n    border-bottom-width: 1px;\n    color: #4a4a4a;\n    display: flex;\n    justify-content: center;\n    margin-bottom: -1px;\n    padding: 0.5em 1em;\n    vertical-align: top; }\n    .tabs a:hover {\n      border-bottom-color: #363636;\n      color: #363636; }\n  .tabs li {\n    display: block; }\n    .tabs li.is-active a {\n      border-bottom-color: #3273dc;\n      color: #3273dc; }\n  .tabs ul {\n    align-items: center;\n    border-bottom-color: #dbdbdb;\n    border-bottom-style: solid;\n    border-bottom-width: 1px;\n    display: flex;\n    flex-grow: 1;\n    flex-shrink: 0;\n    justify-content: flex-start; }\n    .tabs ul.is-left {\n      padding-right: 0.75em; }\n    .tabs ul.is-center {\n      flex: none;\n      justify-content: center;\n      padding-left: 0.75em;\n      padding-right: 0.75em; }\n    .tabs ul.is-right {\n      justify-content: flex-end;\n      padding-left: 0.75em; }\n  .tabs .icon:first-child {\n    margin-right: 0.5em; }\n  .tabs .icon:last-child {\n    margin-left: 0.5em; }\n  .tabs.is-centered ul {\n    justify-content: center; }\n  .tabs.is-right ul {\n    justify-content: flex-end; }\n  .tabs.is-boxed a {\n    border: 1px solid transparent;\n    border-radius: 4px 4px 0 0; }\n    .tabs.is-boxed a:hover {\n      background-color: whitesmoke;\n      border-bottom-color: #dbdbdb; }\n  .tabs.is-boxed li.is-active a {\n    background-color: white;\n    border-color: #dbdbdb;\n    border-bottom-color: transparent !important; }\n  .tabs.is-fullwidth li {\n    flex-grow: 1;\n    flex-shrink: 0; }\n  .tabs.is-toggle a {\n    border-color: #dbdbdb;\n    border-style: solid;\n    border-width: 1px;\n    margin-bottom: 0;\n    position: relative; }\n    .tabs.is-toggle a:hover {\n      background-color: whitesmoke;\n      border-color: #b5b5b5;\n      z-index: 2; }\n  .tabs.is-toggle li + li {\n    margin-left: -1px; }\n  .tabs.is-toggle li:first-child a {\n    border-radius: 4px 0 0 4px; }\n  .tabs.is-toggle li:last-child a {\n    border-radius: 0 4px 4px 0; }\n  .tabs.is-toggle li.is-active a {\n    background-color: #3273dc;\n    border-color: #3273dc;\n    color: #fff;\n    z-index: 1; }\n  .tabs.is-toggle ul {\n    border-bottom: none; }\n  .tabs.is-toggle.is-toggle-rounded li:first-child a {\n    border-bottom-left-radius: 290486px;\n    border-top-left-radius: 290486px;\n    padding-left: 1.25em; }\n  .tabs.is-toggle.is-toggle-rounded li:last-child a {\n    border-bottom-right-radius: 290486px;\n    border-top-right-radius: 290486px;\n    padding-right: 1.25em; }\n  .tabs.is-small {\n    font-size: 0.75rem; }\n  .tabs.is-medium {\n    font-size: 1.25rem; }\n  .tabs.is-large {\n    font-size: 1.5rem; }\n\n.box {\n  background-color: white;\n  border-radius: 6px;\n  box-shadow: 0 0.5em 1em -0.125em rgba(10, 10, 10, 0.1), 0 0px 0 1px rgba(10, 10, 10, 0.02);\n  color: #4a4a4a;\n  display: block;\n  padding: 1.25rem; }\n\na.box:hover, a.box:focus {\n  box-shadow: 0 0.5em 1em -0.125em rgba(10, 10, 10, 0.1), 0 0 0 1px #3273dc; }\n\na.box:active {\n  box-shadow: inset 0 1px 2px rgba(10, 10, 10, 0.2), 0 0 0 1px #3273dc; }\n\n.button {\n  background-color: white;\n  border-color: #dbdbdb;\n  border-width: 2px;\n  color: #363636;\n  cursor: pointer;\n  justify-content: center;\n  padding-bottom: calc(0.5em - 2px);\n  padding-left: 1em;\n  padding-right: 1em;\n  padding-top: calc(0.5em - 2px);\n  text-align: center;\n  white-space: nowrap; }\n  .button strong {\n    color: inherit; }\n  .button .icon, .button .icon.is-small, .button .icon.is-medium, .button .icon.is-large {\n    height: 1.5em;\n    width: 1.5em; }\n  .button .icon:first-child:not(:last-child) {\n    margin-left: calc(-0.5em - 2px);\n    margin-right: 0.25em; }\n  .button .icon:last-child:not(:first-child) {\n    margin-left: 0.25em;\n    margin-right: calc(-0.5em - 2px); }\n  .button .icon:first-child:last-child {\n    margin-left: calc(-0.5em - 2px);\n    margin-right: calc(-0.5em - 2px); }\n  .button:hover, .button.is-hovered {\n    border-color: #b5b5b5;\n    color: #363636; }\n  .button:focus, .button.is-focused {\n    border-color: #3273dc;\n    color: #363636; }\n    .button:focus:not(:active), .button.is-focused:not(:active) {\n      box-shadow: 0 0 0 0.125em rgba(50, 115, 220, 0.25); }\n  .button:active, .button.is-active {\n    border-color: #4a4a4a;\n    color: #363636; }\n  .button.is-text {\n    background-color: transparent;\n    border-color: transparent;\n    color: #4a4a4a;\n    text-decoration: underline; }\n    .button.is-text:hover, .button.is-text.is-hovered, .button.is-text:focus, .button.is-text.is-focused {\n      background-color: whitesmoke;\n      color: #363636; }\n    .button.is-text:active, .button.is-text.is-active {\n      background-color: #e8e8e8;\n      color: #363636; }\n    .button.is-text[disabled],\n    fieldset[disabled] .button.is-text {\n      background-color: transparent;\n      border-color: transparent;\n      box-shadow: none; }\n  .button.is-white {\n    background-color: white;\n    border-color: transparent;\n    color: #0a0a0a; }\n    .button.is-white:hover, .button.is-white.is-hovered {\n      background-color: #f9f9f9;\n      border-color: transparent;\n      color: #0a0a0a; }\n    .button.is-white:focus, .button.is-white.is-focused {\n      border-color: transparent;\n      color: #0a0a0a; }\n      .button.is-white:focus:not(:active), .button.is-white.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(255, 255, 255, 0.25); }\n    .button.is-white:active, .button.is-white.is-active {\n      background-color: #f2f2f2;\n      border-color: transparent;\n      color: #0a0a0a; }\n    .button.is-white[disabled],\n    fieldset[disabled] .button.is-white {\n      background-color: white;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-white.is-inverted {\n      background-color: #0a0a0a;\n      color: white; }\n      .button.is-white.is-inverted:hover, .button.is-white.is-inverted.is-hovered {\n        background-color: black; }\n      .button.is-white.is-inverted[disabled],\n      fieldset[disabled] .button.is-white.is-inverted {\n        background-color: #0a0a0a;\n        border-color: transparent;\n        box-shadow: none;\n        color: white; }\n    .button.is-white.is-loading::after {\n      border-color: transparent transparent #0a0a0a #0a0a0a !important; }\n    .button.is-white.is-outlined {\n      background-color: transparent;\n      border-color: white;\n      color: white; }\n      .button.is-white.is-outlined:hover, .button.is-white.is-outlined.is-hovered, .button.is-white.is-outlined:focus, .button.is-white.is-outlined.is-focused {\n        background-color: white;\n        border-color: white;\n        color: #0a0a0a; }\n      .button.is-white.is-outlined.is-loading::after {\n        border-color: transparent transparent white white !important; }\n      .button.is-white.is-outlined.is-loading:hover::after, .button.is-white.is-outlined.is-loading.is-hovered::after, .button.is-white.is-outlined.is-loading:focus::after, .button.is-white.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #0a0a0a #0a0a0a !important; }\n      .button.is-white.is-outlined[disabled],\n      fieldset[disabled] .button.is-white.is-outlined {\n        background-color: transparent;\n        border-color: white;\n        box-shadow: none;\n        color: white; }\n    .button.is-white.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #0a0a0a;\n      color: #0a0a0a; }\n      .button.is-white.is-inverted.is-outlined:hover, .button.is-white.is-inverted.is-outlined.is-hovered, .button.is-white.is-inverted.is-outlined:focus, .button.is-white.is-inverted.is-outlined.is-focused {\n        background-color: #0a0a0a;\n        color: white; }\n      .button.is-white.is-inverted.is-outlined.is-loading:hover::after, .button.is-white.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-white.is-inverted.is-outlined.is-loading:focus::after, .button.is-white.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent white white !important; }\n      .button.is-white.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-white.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #0a0a0a;\n        box-shadow: none;\n        color: #0a0a0a; }\n  .button.is-black {\n    background-color: #0a0a0a;\n    border-color: transparent;\n    color: white; }\n    .button.is-black:hover, .button.is-black.is-hovered {\n      background-color: #040404;\n      border-color: transparent;\n      color: white; }\n    .button.is-black:focus, .button.is-black.is-focused {\n      border-color: transparent;\n      color: white; }\n      .button.is-black:focus:not(:active), .button.is-black.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(10, 10, 10, 0.25); }\n    .button.is-black:active, .button.is-black.is-active {\n      background-color: black;\n      border-color: transparent;\n      color: white; }\n    .button.is-black[disabled],\n    fieldset[disabled] .button.is-black {\n      background-color: #0a0a0a;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-black.is-inverted {\n      background-color: white;\n      color: #0a0a0a; }\n      .button.is-black.is-inverted:hover, .button.is-black.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-black.is-inverted[disabled],\n      fieldset[disabled] .button.is-black.is-inverted {\n        background-color: white;\n        border-color: transparent;\n        box-shadow: none;\n        color: #0a0a0a; }\n    .button.is-black.is-loading::after {\n      border-color: transparent transparent white white !important; }\n    .button.is-black.is-outlined {\n      background-color: transparent;\n      border-color: #0a0a0a;\n      color: #0a0a0a; }\n      .button.is-black.is-outlined:hover, .button.is-black.is-outlined.is-hovered, .button.is-black.is-outlined:focus, .button.is-black.is-outlined.is-focused {\n        background-color: #0a0a0a;\n        border-color: #0a0a0a;\n        color: white; }\n      .button.is-black.is-outlined.is-loading::after {\n        border-color: transparent transparent #0a0a0a #0a0a0a !important; }\n      .button.is-black.is-outlined.is-loading:hover::after, .button.is-black.is-outlined.is-loading.is-hovered::after, .button.is-black.is-outlined.is-loading:focus::after, .button.is-black.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent white white !important; }\n      .button.is-black.is-outlined[disabled],\n      fieldset[disabled] .button.is-black.is-outlined {\n        background-color: transparent;\n        border-color: #0a0a0a;\n        box-shadow: none;\n        color: #0a0a0a; }\n    .button.is-black.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: white;\n      color: white; }\n      .button.is-black.is-inverted.is-outlined:hover, .button.is-black.is-inverted.is-outlined.is-hovered, .button.is-black.is-inverted.is-outlined:focus, .button.is-black.is-inverted.is-outlined.is-focused {\n        background-color: white;\n        color: #0a0a0a; }\n      .button.is-black.is-inverted.is-outlined.is-loading:hover::after, .button.is-black.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-black.is-inverted.is-outlined.is-loading:focus::after, .button.is-black.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #0a0a0a #0a0a0a !important; }\n      .button.is-black.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-black.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: white;\n        box-shadow: none;\n        color: white; }\n  .button.is-light {\n    background-color: whitesmoke;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n    .button.is-light:hover, .button.is-light.is-hovered {\n      background-color: #eeeeee;\n      border-color: transparent;\n      color: rgba(0, 0, 0, 0.7); }\n    .button.is-light:focus, .button.is-light.is-focused {\n      border-color: transparent;\n      color: rgba(0, 0, 0, 0.7); }\n      .button.is-light:focus:not(:active), .button.is-light.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(245, 245, 245, 0.25); }\n    .button.is-light:active, .button.is-light.is-active {\n      background-color: #e8e8e8;\n      border-color: transparent;\n      color: rgba(0, 0, 0, 0.7); }\n    .button.is-light[disabled],\n    fieldset[disabled] .button.is-light {\n      background-color: whitesmoke;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-light.is-inverted {\n      background-color: rgba(0, 0, 0, 0.7);\n      color: whitesmoke; }\n      .button.is-light.is-inverted:hover, .button.is-light.is-inverted.is-hovered {\n        background-color: rgba(0, 0, 0, 0.7); }\n      .button.is-light.is-inverted[disabled],\n      fieldset[disabled] .button.is-light.is-inverted {\n        background-color: rgba(0, 0, 0, 0.7);\n        border-color: transparent;\n        box-shadow: none;\n        color: whitesmoke; }\n    .button.is-light.is-loading::after {\n      border-color: transparent transparent rgba(0, 0, 0, 0.7) rgba(0, 0, 0, 0.7) !important; }\n    .button.is-light.is-outlined {\n      background-color: transparent;\n      border-color: whitesmoke;\n      color: whitesmoke; }\n      .button.is-light.is-outlined:hover, .button.is-light.is-outlined.is-hovered, .button.is-light.is-outlined:focus, .button.is-light.is-outlined.is-focused {\n        background-color: whitesmoke;\n        border-color: whitesmoke;\n        color: rgba(0, 0, 0, 0.7); }\n      .button.is-light.is-outlined.is-loading::after {\n        border-color: transparent transparent whitesmoke whitesmoke !important; }\n      .button.is-light.is-outlined.is-loading:hover::after, .button.is-light.is-outlined.is-loading.is-hovered::after, .button.is-light.is-outlined.is-loading:focus::after, .button.is-light.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent rgba(0, 0, 0, 0.7) rgba(0, 0, 0, 0.7) !important; }\n      .button.is-light.is-outlined[disabled],\n      fieldset[disabled] .button.is-light.is-outlined {\n        background-color: transparent;\n        border-color: whitesmoke;\n        box-shadow: none;\n        color: whitesmoke; }\n    .button.is-light.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: rgba(0, 0, 0, 0.7);\n      color: rgba(0, 0, 0, 0.7); }\n      .button.is-light.is-inverted.is-outlined:hover, .button.is-light.is-inverted.is-outlined.is-hovered, .button.is-light.is-inverted.is-outlined:focus, .button.is-light.is-inverted.is-outlined.is-focused {\n        background-color: rgba(0, 0, 0, 0.7);\n        color: whitesmoke; }\n      .button.is-light.is-inverted.is-outlined.is-loading:hover::after, .button.is-light.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-light.is-inverted.is-outlined.is-loading:focus::after, .button.is-light.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent whitesmoke whitesmoke !important; }\n      .button.is-light.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-light.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: rgba(0, 0, 0, 0.7);\n        box-shadow: none;\n        color: rgba(0, 0, 0, 0.7); }\n  .button.is-dark {\n    background-color: #353A48;\n    border-color: transparent;\n    color: #fff; }\n    .button.is-dark:hover, .button.is-dark.is-hovered {\n      background-color: #303441;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-dark:focus, .button.is-dark.is-focused {\n      border-color: transparent;\n      color: #fff; }\n      .button.is-dark:focus:not(:active), .button.is-dark.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(53, 58, 72, 0.25); }\n    .button.is-dark:active, .button.is-dark.is-active {\n      background-color: #2a2e39;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-dark[disabled],\n    fieldset[disabled] .button.is-dark {\n      background-color: #353A48;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-dark.is-inverted {\n      background-color: #fff;\n      color: #353A48; }\n      .button.is-dark.is-inverted:hover, .button.is-dark.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-dark.is-inverted[disabled],\n      fieldset[disabled] .button.is-dark.is-inverted {\n        background-color: #fff;\n        border-color: transparent;\n        box-shadow: none;\n        color: #353A48; }\n    .button.is-dark.is-loading::after {\n      border-color: transparent transparent #fff #fff !important; }\n    .button.is-dark.is-outlined {\n      background-color: transparent;\n      border-color: #353A48;\n      color: #353A48; }\n      .button.is-dark.is-outlined:hover, .button.is-dark.is-outlined.is-hovered, .button.is-dark.is-outlined:focus, .button.is-dark.is-outlined.is-focused {\n        background-color: #353A48;\n        border-color: #353A48;\n        color: #fff; }\n      .button.is-dark.is-outlined.is-loading::after {\n        border-color: transparent transparent #353A48 #353A48 !important; }\n      .button.is-dark.is-outlined.is-loading:hover::after, .button.is-dark.is-outlined.is-loading.is-hovered::after, .button.is-dark.is-outlined.is-loading:focus::after, .button.is-dark.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #fff #fff !important; }\n      .button.is-dark.is-outlined[disabled],\n      fieldset[disabled] .button.is-dark.is-outlined {\n        background-color: transparent;\n        border-color: #353A48;\n        box-shadow: none;\n        color: #353A48; }\n    .button.is-dark.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #fff;\n      color: #fff; }\n      .button.is-dark.is-inverted.is-outlined:hover, .button.is-dark.is-inverted.is-outlined.is-hovered, .button.is-dark.is-inverted.is-outlined:focus, .button.is-dark.is-inverted.is-outlined.is-focused {\n        background-color: #fff;\n        color: #353A48; }\n      .button.is-dark.is-inverted.is-outlined.is-loading:hover::after, .button.is-dark.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-dark.is-inverted.is-outlined.is-loading:focus::after, .button.is-dark.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #353A48 #353A48 !important; }\n      .button.is-dark.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-dark.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #fff;\n        box-shadow: none;\n        color: #fff; }\n  .button.is-primary {\n    background-color: #74BE43;\n    border-color: transparent;\n    color: #fff; }\n    .button.is-primary:hover, .button.is-primary.is-hovered {\n      background-color: #6eb53f;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-primary:focus, .button.is-primary.is-focused {\n      border-color: transparent;\n      color: #fff; }\n      .button.is-primary:focus:not(:active), .button.is-primary.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(116, 190, 67, 0.25); }\n    .button.is-primary:active, .button.is-primary.is-active {\n      background-color: #68ac3b;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-primary[disabled],\n    fieldset[disabled] .button.is-primary {\n      background-color: #74BE43;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-primary.is-inverted {\n      background-color: #fff;\n      color: #74BE43; }\n      .button.is-primary.is-inverted:hover, .button.is-primary.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-primary.is-inverted[disabled],\n      fieldset[disabled] .button.is-primary.is-inverted {\n        background-color: #fff;\n        border-color: transparent;\n        box-shadow: none;\n        color: #74BE43; }\n    .button.is-primary.is-loading::after {\n      border-color: transparent transparent #fff #fff !important; }\n    .button.is-primary.is-outlined {\n      background-color: transparent;\n      border-color: #74BE43;\n      color: #74BE43; }\n      .button.is-primary.is-outlined:hover, .button.is-primary.is-outlined.is-hovered, .button.is-primary.is-outlined:focus, .button.is-primary.is-outlined.is-focused {\n        background-color: #74BE43;\n        border-color: #74BE43;\n        color: #fff; }\n      .button.is-primary.is-outlined.is-loading::after {\n        border-color: transparent transparent #74BE43 #74BE43 !important; }\n      .button.is-primary.is-outlined.is-loading:hover::after, .button.is-primary.is-outlined.is-loading.is-hovered::after, .button.is-primary.is-outlined.is-loading:focus::after, .button.is-primary.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #fff #fff !important; }\n      .button.is-primary.is-outlined[disabled],\n      fieldset[disabled] .button.is-primary.is-outlined {\n        background-color: transparent;\n        border-color: #74BE43;\n        box-shadow: none;\n        color: #74BE43; }\n    .button.is-primary.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #fff;\n      color: #fff; }\n      .button.is-primary.is-inverted.is-outlined:hover, .button.is-primary.is-inverted.is-outlined.is-hovered, .button.is-primary.is-inverted.is-outlined:focus, .button.is-primary.is-inverted.is-outlined.is-focused {\n        background-color: #fff;\n        color: #74BE43; }\n      .button.is-primary.is-inverted.is-outlined.is-loading:hover::after, .button.is-primary.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-primary.is-inverted.is-outlined.is-loading:focus::after, .button.is-primary.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #74BE43 #74BE43 !important; }\n      .button.is-primary.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-primary.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #fff;\n        box-shadow: none;\n        color: #fff; }\n    .button.is-primary.is-light {\n      background-color: #f4faf0;\n      color: #4a792a; }\n      .button.is-primary.is-light:hover, .button.is-primary.is-light.is-hovered {\n        background-color: #edf6e6;\n        border-color: transparent;\n        color: #4a792a; }\n      .button.is-primary.is-light:active, .button.is-primary.is-light.is-active {\n        background-color: #e6f3dd;\n        border-color: transparent;\n        color: #4a792a; }\n  .button.is-link {\n    background-color: #3273dc;\n    border-color: transparent;\n    color: #fff; }\n    .button.is-link:hover, .button.is-link.is-hovered {\n      background-color: #276cda;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-link:focus, .button.is-link.is-focused {\n      border-color: transparent;\n      color: #fff; }\n      .button.is-link:focus:not(:active), .button.is-link.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(50, 115, 220, 0.25); }\n    .button.is-link:active, .button.is-link.is-active {\n      background-color: #2366d1;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-link[disabled],\n    fieldset[disabled] .button.is-link {\n      background-color: #3273dc;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-link.is-inverted {\n      background-color: #fff;\n      color: #3273dc; }\n      .button.is-link.is-inverted:hover, .button.is-link.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-link.is-inverted[disabled],\n      fieldset[disabled] .button.is-link.is-inverted {\n        background-color: #fff;\n        border-color: transparent;\n        box-shadow: none;\n        color: #3273dc; }\n    .button.is-link.is-loading::after {\n      border-color: transparent transparent #fff #fff !important; }\n    .button.is-link.is-outlined {\n      background-color: transparent;\n      border-color: #3273dc;\n      color: #3273dc; }\n      .button.is-link.is-outlined:hover, .button.is-link.is-outlined.is-hovered, .button.is-link.is-outlined:focus, .button.is-link.is-outlined.is-focused {\n        background-color: #3273dc;\n        border-color: #3273dc;\n        color: #fff; }\n      .button.is-link.is-outlined.is-loading::after {\n        border-color: transparent transparent #3273dc #3273dc !important; }\n      .button.is-link.is-outlined.is-loading:hover::after, .button.is-link.is-outlined.is-loading.is-hovered::after, .button.is-link.is-outlined.is-loading:focus::after, .button.is-link.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #fff #fff !important; }\n      .button.is-link.is-outlined[disabled],\n      fieldset[disabled] .button.is-link.is-outlined {\n        background-color: transparent;\n        border-color: #3273dc;\n        box-shadow: none;\n        color: #3273dc; }\n    .button.is-link.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #fff;\n      color: #fff; }\n      .button.is-link.is-inverted.is-outlined:hover, .button.is-link.is-inverted.is-outlined.is-hovered, .button.is-link.is-inverted.is-outlined:focus, .button.is-link.is-inverted.is-outlined.is-focused {\n        background-color: #fff;\n        color: #3273dc; }\n      .button.is-link.is-inverted.is-outlined.is-loading:hover::after, .button.is-link.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-link.is-inverted.is-outlined.is-loading:focus::after, .button.is-link.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #3273dc #3273dc !important; }\n      .button.is-link.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-link.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #fff;\n        box-shadow: none;\n        color: #fff; }\n    .button.is-link.is-light {\n      background-color: #eef3fc;\n      color: #2160c4; }\n      .button.is-link.is-light:hover, .button.is-link.is-light.is-hovered {\n        background-color: #e3ecfa;\n        border-color: transparent;\n        color: #2160c4; }\n      .button.is-link.is-light:active, .button.is-link.is-light.is-active {\n        background-color: #d8e4f8;\n        border-color: transparent;\n        color: #2160c4; }\n  .button.is-info {\n    background-color: #3298dc;\n    border-color: transparent;\n    color: #fff; }\n    .button.is-info:hover, .button.is-info.is-hovered {\n      background-color: #2793da;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-info:focus, .button.is-info.is-focused {\n      border-color: transparent;\n      color: #fff; }\n      .button.is-info:focus:not(:active), .button.is-info.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(50, 152, 220, 0.25); }\n    .button.is-info:active, .button.is-info.is-active {\n      background-color: #238cd1;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-info[disabled],\n    fieldset[disabled] .button.is-info {\n      background-color: #3298dc;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-info.is-inverted {\n      background-color: #fff;\n      color: #3298dc; }\n      .button.is-info.is-inverted:hover, .button.is-info.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-info.is-inverted[disabled],\n      fieldset[disabled] .button.is-info.is-inverted {\n        background-color: #fff;\n        border-color: transparent;\n        box-shadow: none;\n        color: #3298dc; }\n    .button.is-info.is-loading::after {\n      border-color: transparent transparent #fff #fff !important; }\n    .button.is-info.is-outlined {\n      background-color: transparent;\n      border-color: #3298dc;\n      color: #3298dc; }\n      .button.is-info.is-outlined:hover, .button.is-info.is-outlined.is-hovered, .button.is-info.is-outlined:focus, .button.is-info.is-outlined.is-focused {\n        background-color: #3298dc;\n        border-color: #3298dc;\n        color: #fff; }\n      .button.is-info.is-outlined.is-loading::after {\n        border-color: transparent transparent #3298dc #3298dc !important; }\n      .button.is-info.is-outlined.is-loading:hover::after, .button.is-info.is-outlined.is-loading.is-hovered::after, .button.is-info.is-outlined.is-loading:focus::after, .button.is-info.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #fff #fff !important; }\n      .button.is-info.is-outlined[disabled],\n      fieldset[disabled] .button.is-info.is-outlined {\n        background-color: transparent;\n        border-color: #3298dc;\n        box-shadow: none;\n        color: #3298dc; }\n    .button.is-info.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #fff;\n      color: #fff; }\n      .button.is-info.is-inverted.is-outlined:hover, .button.is-info.is-inverted.is-outlined.is-hovered, .button.is-info.is-inverted.is-outlined:focus, .button.is-info.is-inverted.is-outlined.is-focused {\n        background-color: #fff;\n        color: #3298dc; }\n      .button.is-info.is-inverted.is-outlined.is-loading:hover::after, .button.is-info.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-info.is-inverted.is-outlined.is-loading:focus::after, .button.is-info.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #3298dc #3298dc !important; }\n      .button.is-info.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-info.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #fff;\n        box-shadow: none;\n        color: #fff; }\n    .button.is-info.is-light {\n      background-color: #eef6fc;\n      color: #1d72aa; }\n      .button.is-info.is-light:hover, .button.is-info.is-light.is-hovered {\n        background-color: #e3f1fa;\n        border-color: transparent;\n        color: #1d72aa; }\n      .button.is-info.is-light:active, .button.is-info.is-light.is-active {\n        background-color: #d8ebf8;\n        border-color: transparent;\n        color: #1d72aa; }\n  .button.is-success {\n    background-color: #74BE43;\n    border-color: transparent;\n    color: #fff; }\n    .button.is-success:hover, .button.is-success.is-hovered {\n      background-color: #6eb53f;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-success:focus, .button.is-success.is-focused {\n      border-color: transparent;\n      color: #fff; }\n      .button.is-success:focus:not(:active), .button.is-success.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(116, 190, 67, 0.25); }\n    .button.is-success:active, .button.is-success.is-active {\n      background-color: #68ac3b;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-success[disabled],\n    fieldset[disabled] .button.is-success {\n      background-color: #74BE43;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-success.is-inverted {\n      background-color: #fff;\n      color: #74BE43; }\n      .button.is-success.is-inverted:hover, .button.is-success.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-success.is-inverted[disabled],\n      fieldset[disabled] .button.is-success.is-inverted {\n        background-color: #fff;\n        border-color: transparent;\n        box-shadow: none;\n        color: #74BE43; }\n    .button.is-success.is-loading::after {\n      border-color: transparent transparent #fff #fff !important; }\n    .button.is-success.is-outlined {\n      background-color: transparent;\n      border-color: #74BE43;\n      color: #74BE43; }\n      .button.is-success.is-outlined:hover, .button.is-success.is-outlined.is-hovered, .button.is-success.is-outlined:focus, .button.is-success.is-outlined.is-focused {\n        background-color: #74BE43;\n        border-color: #74BE43;\n        color: #fff; }\n      .button.is-success.is-outlined.is-loading::after {\n        border-color: transparent transparent #74BE43 #74BE43 !important; }\n      .button.is-success.is-outlined.is-loading:hover::after, .button.is-success.is-outlined.is-loading.is-hovered::after, .button.is-success.is-outlined.is-loading:focus::after, .button.is-success.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #fff #fff !important; }\n      .button.is-success.is-outlined[disabled],\n      fieldset[disabled] .button.is-success.is-outlined {\n        background-color: transparent;\n        border-color: #74BE43;\n        box-shadow: none;\n        color: #74BE43; }\n    .button.is-success.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #fff;\n      color: #fff; }\n      .button.is-success.is-inverted.is-outlined:hover, .button.is-success.is-inverted.is-outlined.is-hovered, .button.is-success.is-inverted.is-outlined:focus, .button.is-success.is-inverted.is-outlined.is-focused {\n        background-color: #fff;\n        color: #74BE43; }\n      .button.is-success.is-inverted.is-outlined.is-loading:hover::after, .button.is-success.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-success.is-inverted.is-outlined.is-loading:focus::after, .button.is-success.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #74BE43 #74BE43 !important; }\n      .button.is-success.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-success.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #fff;\n        box-shadow: none;\n        color: #fff; }\n    .button.is-success.is-light {\n      background-color: #f4faf0;\n      color: #4a792a; }\n      .button.is-success.is-light:hover, .button.is-success.is-light.is-hovered {\n        background-color: #edf6e6;\n        border-color: transparent;\n        color: #4a792a; }\n      .button.is-success.is-light:active, .button.is-success.is-light.is-active {\n        background-color: #e6f3dd;\n        border-color: transparent;\n        color: #4a792a; }\n  .button.is-warning {\n    background-color: #ffdd57;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n    .button.is-warning:hover, .button.is-warning.is-hovered {\n      background-color: #ffdb4a;\n      border-color: transparent;\n      color: rgba(0, 0, 0, 0.7); }\n    .button.is-warning:focus, .button.is-warning.is-focused {\n      border-color: transparent;\n      color: rgba(0, 0, 0, 0.7); }\n      .button.is-warning:focus:not(:active), .button.is-warning.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(255, 221, 87, 0.25); }\n    .button.is-warning:active, .button.is-warning.is-active {\n      background-color: #ffd83d;\n      border-color: transparent;\n      color: rgba(0, 0, 0, 0.7); }\n    .button.is-warning[disabled],\n    fieldset[disabled] .button.is-warning {\n      background-color: #ffdd57;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-warning.is-inverted {\n      background-color: rgba(0, 0, 0, 0.7);\n      color: #ffdd57; }\n      .button.is-warning.is-inverted:hover, .button.is-warning.is-inverted.is-hovered {\n        background-color: rgba(0, 0, 0, 0.7); }\n      .button.is-warning.is-inverted[disabled],\n      fieldset[disabled] .button.is-warning.is-inverted {\n        background-color: rgba(0, 0, 0, 0.7);\n        border-color: transparent;\n        box-shadow: none;\n        color: #ffdd57; }\n    .button.is-warning.is-loading::after {\n      border-color: transparent transparent rgba(0, 0, 0, 0.7) rgba(0, 0, 0, 0.7) !important; }\n    .button.is-warning.is-outlined {\n      background-color: transparent;\n      border-color: #ffdd57;\n      color: #ffdd57; }\n      .button.is-warning.is-outlined:hover, .button.is-warning.is-outlined.is-hovered, .button.is-warning.is-outlined:focus, .button.is-warning.is-outlined.is-focused {\n        background-color: #ffdd57;\n        border-color: #ffdd57;\n        color: rgba(0, 0, 0, 0.7); }\n      .button.is-warning.is-outlined.is-loading::after {\n        border-color: transparent transparent #ffdd57 #ffdd57 !important; }\n      .button.is-warning.is-outlined.is-loading:hover::after, .button.is-warning.is-outlined.is-loading.is-hovered::after, .button.is-warning.is-outlined.is-loading:focus::after, .button.is-warning.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent rgba(0, 0, 0, 0.7) rgba(0, 0, 0, 0.7) !important; }\n      .button.is-warning.is-outlined[disabled],\n      fieldset[disabled] .button.is-warning.is-outlined {\n        background-color: transparent;\n        border-color: #ffdd57;\n        box-shadow: none;\n        color: #ffdd57; }\n    .button.is-warning.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: rgba(0, 0, 0, 0.7);\n      color: rgba(0, 0, 0, 0.7); }\n      .button.is-warning.is-inverted.is-outlined:hover, .button.is-warning.is-inverted.is-outlined.is-hovered, .button.is-warning.is-inverted.is-outlined:focus, .button.is-warning.is-inverted.is-outlined.is-focused {\n        background-color: rgba(0, 0, 0, 0.7);\n        color: #ffdd57; }\n      .button.is-warning.is-inverted.is-outlined.is-loading:hover::after, .button.is-warning.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-warning.is-inverted.is-outlined.is-loading:focus::after, .button.is-warning.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #ffdd57 #ffdd57 !important; }\n      .button.is-warning.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-warning.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: rgba(0, 0, 0, 0.7);\n        box-shadow: none;\n        color: rgba(0, 0, 0, 0.7); }\n    .button.is-warning.is-light {\n      background-color: #fffbeb;\n      color: #947600; }\n      .button.is-warning.is-light:hover, .button.is-warning.is-light.is-hovered {\n        background-color: #fff8de;\n        border-color: transparent;\n        color: #947600; }\n      .button.is-warning.is-light:active, .button.is-warning.is-light.is-active {\n        background-color: #fff6d1;\n        border-color: transparent;\n        color: #947600; }\n  .button.is-danger {\n    background-color: #f14668;\n    border-color: transparent;\n    color: #fff; }\n    .button.is-danger:hover, .button.is-danger.is-hovered {\n      background-color: #f03a5f;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-danger:focus, .button.is-danger.is-focused {\n      border-color: transparent;\n      color: #fff; }\n      .button.is-danger:focus:not(:active), .button.is-danger.is-focused:not(:active) {\n        box-shadow: 0 0 0 0.125em rgba(241, 70, 104, 0.25); }\n    .button.is-danger:active, .button.is-danger.is-active {\n      background-color: #ef2e55;\n      border-color: transparent;\n      color: #fff; }\n    .button.is-danger[disabled],\n    fieldset[disabled] .button.is-danger {\n      background-color: #f14668;\n      border-color: transparent;\n      box-shadow: none; }\n    .button.is-danger.is-inverted {\n      background-color: #fff;\n      color: #f14668; }\n      .button.is-danger.is-inverted:hover, .button.is-danger.is-inverted.is-hovered {\n        background-color: #f2f2f2; }\n      .button.is-danger.is-inverted[disabled],\n      fieldset[disabled] .button.is-danger.is-inverted {\n        background-color: #fff;\n        border-color: transparent;\n        box-shadow: none;\n        color: #f14668; }\n    .button.is-danger.is-loading::after {\n      border-color: transparent transparent #fff #fff !important; }\n    .button.is-danger.is-outlined {\n      background-color: transparent;\n      border-color: #f14668;\n      color: #f14668; }\n      .button.is-danger.is-outlined:hover, .button.is-danger.is-outlined.is-hovered, .button.is-danger.is-outlined:focus, .button.is-danger.is-outlined.is-focused {\n        background-color: #f14668;\n        border-color: #f14668;\n        color: #fff; }\n      .button.is-danger.is-outlined.is-loading::after {\n        border-color: transparent transparent #f14668 #f14668 !important; }\n      .button.is-danger.is-outlined.is-loading:hover::after, .button.is-danger.is-outlined.is-loading.is-hovered::after, .button.is-danger.is-outlined.is-loading:focus::after, .button.is-danger.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #fff #fff !important; }\n      .button.is-danger.is-outlined[disabled],\n      fieldset[disabled] .button.is-danger.is-outlined {\n        background-color: transparent;\n        border-color: #f14668;\n        box-shadow: none;\n        color: #f14668; }\n    .button.is-danger.is-inverted.is-outlined {\n      background-color: transparent;\n      border-color: #fff;\n      color: #fff; }\n      .button.is-danger.is-inverted.is-outlined:hover, .button.is-danger.is-inverted.is-outlined.is-hovered, .button.is-danger.is-inverted.is-outlined:focus, .button.is-danger.is-inverted.is-outlined.is-focused {\n        background-color: #fff;\n        color: #f14668; }\n      .button.is-danger.is-inverted.is-outlined.is-loading:hover::after, .button.is-danger.is-inverted.is-outlined.is-loading.is-hovered::after, .button.is-danger.is-inverted.is-outlined.is-loading:focus::after, .button.is-danger.is-inverted.is-outlined.is-loading.is-focused::after {\n        border-color: transparent transparent #f14668 #f14668 !important; }\n      .button.is-danger.is-inverted.is-outlined[disabled],\n      fieldset[disabled] .button.is-danger.is-inverted.is-outlined {\n        background-color: transparent;\n        border-color: #fff;\n        box-shadow: none;\n        color: #fff; }\n    .button.is-danger.is-light {\n      background-color: #feecf0;\n      color: #cc0f35; }\n      .button.is-danger.is-light:hover, .button.is-danger.is-light.is-hovered {\n        background-color: #fde0e6;\n        border-color: transparent;\n        color: #cc0f35; }\n      .button.is-danger.is-light:active, .button.is-danger.is-light.is-active {\n        background-color: #fcd4dc;\n        border-color: transparent;\n        color: #cc0f35; }\n  .button.is-small {\n    border-radius: 2px;\n    font-size: 0.75rem; }\n  .button.is-normal {\n    font-size: 1rem; }\n  .button.is-medium {\n    font-size: 1.25rem; }\n  .button.is-large {\n    font-size: 1.5rem; }\n  .button[disabled],\n  fieldset[disabled] .button {\n    background-color: white;\n    border-color: #dbdbdb;\n    box-shadow: none;\n    opacity: 0.5; }\n  .button.is-fullwidth {\n    display: flex;\n    width: 100%; }\n  .button.is-loading {\n    color: transparent !important;\n    pointer-events: none; }\n    .button.is-loading::after {\n      position: absolute;\n      left: calc(50% - (1em / 2));\n      top: calc(50% - (1em / 2));\n      position: absolute !important; }\n  .button.is-static {\n    background-color: whitesmoke;\n    border-color: #dbdbdb;\n    color: #7a7a7a;\n    box-shadow: none;\n    pointer-events: none; }\n  .button.is-rounded {\n    border-radius: 290486px;\n    padding-left: calc(1em + 0.25em);\n    padding-right: calc(1em + 0.25em); }\n\n.buttons {\n  align-items: center;\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-start; }\n  .buttons .button {\n    margin-bottom: 0.5rem; }\n    .buttons .button:not(:last-child):not(.is-fullwidth) {\n      margin-right: 0.5rem; }\n  .buttons:last-child {\n    margin-bottom: -0.5rem; }\n  .buttons:not(:last-child) {\n    margin-bottom: 1rem; }\n  .buttons.are-small .button:not(.is-normal):not(.is-medium):not(.is-large) {\n    border-radius: 2px;\n    font-size: 0.75rem; }\n  .buttons.are-medium .button:not(.is-small):not(.is-normal):not(.is-large) {\n    font-size: 1.25rem; }\n  .buttons.are-large .button:not(.is-small):not(.is-normal):not(.is-medium) {\n    font-size: 1.5rem; }\n  .buttons.has-addons .button:not(:first-child) {\n    border-bottom-left-radius: 0;\n    border-top-left-radius: 0; }\n  .buttons.has-addons .button:not(:last-child) {\n    border-bottom-right-radius: 0;\n    border-top-right-radius: 0;\n    margin-right: -1px; }\n  .buttons.has-addons .button:last-child {\n    margin-right: 0; }\n  .buttons.has-addons .button:hover, .buttons.has-addons .button.is-hovered {\n    z-index: 2; }\n  .buttons.has-addons .button:focus, .buttons.has-addons .button.is-focused, .buttons.has-addons .button:active, .buttons.has-addons .button.is-active, .buttons.has-addons .button.is-selected {\n    z-index: 3; }\n    .buttons.has-addons .button:focus:hover, .buttons.has-addons .button.is-focused:hover, .buttons.has-addons .button:active:hover, .buttons.has-addons .button.is-active:hover, .buttons.has-addons .button.is-selected:hover {\n      z-index: 4; }\n  .buttons.has-addons .button.is-expanded {\n    flex-grow: 1;\n    flex-shrink: 1; }\n  .buttons.is-centered {\n    justify-content: center; }\n    .buttons.is-centered:not(.has-addons) .button:not(.is-fullwidth) {\n      margin-left: 0.25rem;\n      margin-right: 0.25rem; }\n  .buttons.is-right {\n    justify-content: flex-end; }\n    .buttons.is-right:not(.has-addons) .button:not(.is-fullwidth) {\n      margin-left: 0.25rem;\n      margin-right: 0.25rem; }\n\n.container {\n  flex-grow: 1;\n  margin: 0 auto;\n  position: relative;\n  width: auto; }\n  .container.is-fluid {\n    max-width: none;\n    padding-left: 32px;\n    padding-right: 32px;\n    width: 100%; }\n  @media screen and (min-width: 1024px) {\n    .container {\n      max-width: 960px; } }\n\n.content li + li {\n  margin-top: 0.25em; }\n\n.content p:not(:last-child),\n.content dl:not(:last-child),\n.content ol:not(:last-child),\n.content ul:not(:last-child),\n.content blockquote:not(:last-child),\n.content pre:not(:last-child),\n.content table:not(:last-child) {\n  margin-bottom: 1em; }\n\n.content h1,\n.content h2,\n.content h3,\n.content h4,\n.content h5,\n.content h6 {\n  color: #363636;\n  font-weight: 600;\n  line-height: 1.125; }\n\n.content h1 {\n  font-size: 2em;\n  margin-bottom: 0.5em; }\n  .content h1:not(:first-child) {\n    margin-top: 1em; }\n\n.content h2 {\n  font-size: 1.75em;\n  margin-bottom: 0.5714em; }\n  .content h2:not(:first-child) {\n    margin-top: 1.1428em; }\n\n.content h3 {\n  font-size: 1.5em;\n  margin-bottom: 0.6666em; }\n  .content h3:not(:first-child) {\n    margin-top: 1.3333em; }\n\n.content h4 {\n  font-size: 1.25em;\n  margin-bottom: 0.8em; }\n\n.content h5 {\n  font-size: 1.125em;\n  margin-bottom: 0.8888em; }\n\n.content h6 {\n  font-size: 1em;\n  margin-bottom: 1em; }\n\n.content blockquote {\n  background-color: whitesmoke;\n  border-left: 5px solid #dbdbdb;\n  padding: 1.25em 1.5em; }\n\n.content ol {\n  list-style-position: outside;\n  margin-left: 2em;\n  margin-top: 1em; }\n  .content ol:not([type]) {\n    list-style-type: decimal; }\n    .content ol:not([type]).is-lower-alpha {\n      list-style-type: lower-alpha; }\n    .content ol:not([type]).is-lower-roman {\n      list-style-type: lower-roman; }\n    .content ol:not([type]).is-upper-alpha {\n      list-style-type: upper-alpha; }\n    .content ol:not([type]).is-upper-roman {\n      list-style-type: upper-roman; }\n\n.content ul {\n  list-style: disc outside;\n  margin-left: 2em;\n  margin-top: 1em; }\n  .content ul ul {\n    list-style-type: circle;\n    margin-top: 0.5em; }\n    .content ul ul ul {\n      list-style-type: square; }\n\n.content dd {\n  margin-left: 2em; }\n\n.content figure {\n  margin-left: 2em;\n  margin-right: 2em;\n  text-align: center; }\n  .content figure:not(:first-child) {\n    margin-top: 2em; }\n  .content figure:not(:last-child) {\n    margin-bottom: 2em; }\n  .content figure img {\n    display: inline-block; }\n  .content figure figcaption {\n    font-style: italic; }\n\n.content pre {\n  -webkit-overflow-scrolling: touch;\n  overflow-x: auto;\n  padding: 1.25em 1.5em;\n  white-space: pre;\n  word-wrap: normal; }\n\n.content sup,\n.content sub {\n  font-size: 75%; }\n\n.content table {\n  width: 100%; }\n  .content table td,\n  .content table th {\n    border: 1px solid #dbdbdb;\n    border-width: 0 0 1px;\n    padding: 0.5em 0.75em;\n    vertical-align: top; }\n  .content table th {\n    color: #363636; }\n    .content table th:not([align]) {\n      text-align: left; }\n  .content table thead td,\n  .content table thead th {\n    border-width: 0 0 2px;\n    color: #363636; }\n  .content table tfoot td,\n  .content table tfoot th {\n    border-width: 2px 0 0;\n    color: #363636; }\n  .content table tbody tr:last-child td,\n  .content table tbody tr:last-child th {\n    border-bottom-width: 0; }\n\n.content .tabs li + li {\n  margin-top: 0; }\n\n.content.is-small {\n  font-size: 0.75rem; }\n\n.content.is-medium {\n  font-size: 1.25rem; }\n\n.content.is-large {\n  font-size: 1.5rem; }\n\n.icon {\n  align-items: center;\n  display: inline-flex;\n  justify-content: center;\n  height: 1.5rem;\n  width: 1.5rem; }\n  .icon.is-small {\n    height: 1rem;\n    width: 1rem; }\n  .icon.is-medium {\n    height: 2rem;\n    width: 2rem; }\n  .icon.is-large {\n    height: 3rem;\n    width: 3rem; }\n\n.image {\n  display: block;\n  position: relative; }\n  .image img {\n    display: block;\n    height: auto;\n    width: 100%; }\n    .image img.is-rounded {\n      border-radius: 290486px; }\n  .image.is-fullwidth {\n    width: 100%; }\n  .image.is-square img,\n  .image.is-square .has-ratio, .image.is-1by1 img,\n  .image.is-1by1 .has-ratio, .image.is-5by4 img,\n  .image.is-5by4 .has-ratio, .image.is-4by3 img,\n  .image.is-4by3 .has-ratio, .image.is-3by2 img,\n  .image.is-3by2 .has-ratio, .image.is-5by3 img,\n  .image.is-5by3 .has-ratio, .image.is-16by9 img,\n  .image.is-16by9 .has-ratio, .image.is-2by1 img,\n  .image.is-2by1 .has-ratio, .image.is-3by1 img,\n  .image.is-3by1 .has-ratio, .image.is-4by5 img,\n  .image.is-4by5 .has-ratio, .image.is-3by4 img,\n  .image.is-3by4 .has-ratio, .image.is-2by3 img,\n  .image.is-2by3 .has-ratio, .image.is-3by5 img,\n  .image.is-3by5 .has-ratio, .image.is-9by16 img,\n  .image.is-9by16 .has-ratio, .image.is-1by2 img,\n  .image.is-1by2 .has-ratio, .image.is-1by3 img,\n  .image.is-1by3 .has-ratio {\n    height: 100%;\n    width: 100%; }\n  .image.is-square, .image.is-1by1 {\n    padding-top: 100%; }\n  .image.is-5by4 {\n    padding-top: 80%; }\n  .image.is-4by3 {\n    padding-top: 75%; }\n  .image.is-3by2 {\n    padding-top: 66.6666%; }\n  .image.is-5by3 {\n    padding-top: 60%; }\n  .image.is-16by9 {\n    padding-top: 56.25%; }\n  .image.is-2by1 {\n    padding-top: 50%; }\n  .image.is-3by1 {\n    padding-top: 33.3333%; }\n  .image.is-4by5 {\n    padding-top: 125%; }\n  .image.is-3by4 {\n    padding-top: 133.3333%; }\n  .image.is-2by3 {\n    padding-top: 150%; }\n  .image.is-3by5 {\n    padding-top: 166.6666%; }\n  .image.is-9by16 {\n    padding-top: 177.7777%; }\n  .image.is-1by2 {\n    padding-top: 200%; }\n  .image.is-1by3 {\n    padding-top: 300%; }\n  .image.is-16x16 {\n    height: 16px;\n    width: 16px; }\n  .image.is-24x24 {\n    height: 24px;\n    width: 24px; }\n  .image.is-32x32 {\n    height: 32px;\n    width: 32px; }\n  .image.is-48x48 {\n    height: 48px;\n    width: 48px; }\n  .image.is-64x64 {\n    height: 64px;\n    width: 64px; }\n  .image.is-96x96 {\n    height: 96px;\n    width: 96px; }\n  .image.is-128x128 {\n    height: 128px;\n    width: 128px; }\n\n.notification {\n  background-color: whitesmoke;\n  border-radius: 4px;\n  padding: 1.25rem 2.5rem 1.25rem 1.5rem;\n  position: relative; }\n  .notification a:not(.button):not(.dropdown-item) {\n    color: currentColor;\n    text-decoration: underline; }\n  .notification strong {\n    color: currentColor; }\n  .notification code,\n  .notification pre {\n    background: white; }\n  .notification pre code {\n    background: transparent; }\n  .notification > .delete {\n    position: absolute;\n    right: 0.5rem;\n    top: 0.5rem; }\n  .notification .title,\n  .notification .subtitle,\n  .notification .content {\n    color: currentColor; }\n  .notification.is-white {\n    background-color: white;\n    color: #0a0a0a; }\n  .notification.is-black {\n    background-color: #0a0a0a;\n    color: white; }\n  .notification.is-light {\n    background-color: whitesmoke;\n    color: rgba(0, 0, 0, 0.7); }\n  .notification.is-dark {\n    background-color: #353A48;\n    color: #fff; }\n  .notification.is-primary {\n    background-color: #74BE43;\n    color: #fff; }\n  .notification.is-link {\n    background-color: #3273dc;\n    color: #fff; }\n  .notification.is-info {\n    background-color: #3298dc;\n    color: #fff; }\n  .notification.is-success {\n    background-color: #74BE43;\n    color: #fff; }\n  .notification.is-warning {\n    background-color: #ffdd57;\n    color: rgba(0, 0, 0, 0.7); }\n  .notification.is-danger {\n    background-color: #f14668;\n    color: #fff; }\n\n.progress {\n  -moz-appearance: none;\n  -webkit-appearance: none;\n  border: none;\n  border-radius: 290486px;\n  display: block;\n  height: 1rem;\n  overflow: hidden;\n  padding: 0;\n  width: 100%; }\n  .progress::-webkit-progress-bar {\n    background-color: #ededed; }\n  .progress::-webkit-progress-value {\n    background-color: #4a4a4a; }\n  .progress::-moz-progress-bar {\n    background-color: #4a4a4a; }\n  .progress::-ms-fill {\n    background-color: #4a4a4a;\n    border: none; }\n  .progress.is-white::-webkit-progress-value {\n    background-color: white; }\n  .progress.is-white::-moz-progress-bar {\n    background-color: white; }\n  .progress.is-white::-ms-fill {\n    background-color: white; }\n  .progress.is-white:indeterminate {\n    background-image: linear-gradient(to right, white 30%, #ededed 30%); }\n  .progress.is-black::-webkit-progress-value {\n    background-color: #0a0a0a; }\n  .progress.is-black::-moz-progress-bar {\n    background-color: #0a0a0a; }\n  .progress.is-black::-ms-fill {\n    background-color: #0a0a0a; }\n  .progress.is-black:indeterminate {\n    background-image: linear-gradient(to right, #0a0a0a 30%, #ededed 30%); }\n  .progress.is-light::-webkit-progress-value {\n    background-color: whitesmoke; }\n  .progress.is-light::-moz-progress-bar {\n    background-color: whitesmoke; }\n  .progress.is-light::-ms-fill {\n    background-color: whitesmoke; }\n  .progress.is-light:indeterminate {\n    background-image: linear-gradient(to right, whitesmoke 30%, #ededed 30%); }\n  .progress.is-dark::-webkit-progress-value {\n    background-color: #353A48; }\n  .progress.is-dark::-moz-progress-bar {\n    background-color: #353A48; }\n  .progress.is-dark::-ms-fill {\n    background-color: #353A48; }\n  .progress.is-dark:indeterminate {\n    background-image: linear-gradient(to right, #353A48 30%, #ededed 30%); }\n  .progress.is-primary::-webkit-progress-value {\n    background-color: #74BE43; }\n  .progress.is-primary::-moz-progress-bar {\n    background-color: #74BE43; }\n  .progress.is-primary::-ms-fill {\n    background-color: #74BE43; }\n  .progress.is-primary:indeterminate {\n    background-image: linear-gradient(to right, #74BE43 30%, #ededed 30%); }\n  .progress.is-link::-webkit-progress-value {\n    background-color: #3273dc; }\n  .progress.is-link::-moz-progress-bar {\n    background-color: #3273dc; }\n  .progress.is-link::-ms-fill {\n    background-color: #3273dc; }\n  .progress.is-link:indeterminate {\n    background-image: linear-gradient(to right, #3273dc 30%, #ededed 30%); }\n  .progress.is-info::-webkit-progress-value {\n    background-color: #3298dc; }\n  .progress.is-info::-moz-progress-bar {\n    background-color: #3298dc; }\n  .progress.is-info::-ms-fill {\n    background-color: #3298dc; }\n  .progress.is-info:indeterminate {\n    background-image: linear-gradient(to right, #3298dc 30%, #ededed 30%); }\n  .progress.is-success::-webkit-progress-value {\n    background-color: #74BE43; }\n  .progress.is-success::-moz-progress-bar {\n    background-color: #74BE43; }\n  .progress.is-success::-ms-fill {\n    background-color: #74BE43; }\n  .progress.is-success:indeterminate {\n    background-image: linear-gradient(to right, #74BE43 30%, #ededed 30%); }\n  .progress.is-warning::-webkit-progress-value {\n    background-color: #ffdd57; }\n  .progress.is-warning::-moz-progress-bar {\n    background-color: #ffdd57; }\n  .progress.is-warning::-ms-fill {\n    background-color: #ffdd57; }\n  .progress.is-warning:indeterminate {\n    background-image: linear-gradient(to right, #ffdd57 30%, #ededed 30%); }\n  .progress.is-danger::-webkit-progress-value {\n    background-color: #f14668; }\n  .progress.is-danger::-moz-progress-bar {\n    background-color: #f14668; }\n  .progress.is-danger::-ms-fill {\n    background-color: #f14668; }\n  .progress.is-danger:indeterminate {\n    background-image: linear-gradient(to right, #f14668 30%, #ededed 30%); }\n  .progress:indeterminate {\n    animation-duration: 1.5s;\n    animation-iteration-count: infinite;\n    animation-name: moveIndeterminate;\n    animation-timing-function: linear;\n    background-color: #ededed;\n    background-image: linear-gradient(to right, #4a4a4a 30%, #ededed 30%);\n    background-position: top left;\n    background-repeat: no-repeat;\n    background-size: 150% 150%; }\n    .progress:indeterminate::-webkit-progress-bar {\n      background-color: transparent; }\n    .progress:indeterminate::-moz-progress-bar {\n      background-color: transparent; }\n  .progress.is-small {\n    height: 0.75rem; }\n  .progress.is-medium {\n    height: 1.25rem; }\n  .progress.is-large {\n    height: 1.5rem; }\n\n@keyframes moveIndeterminate {\n  from {\n    background-position: 200% 0; }\n  to {\n    background-position: -200% 0; } }\n\n.table {\n  background-color: white;\n  color: #363636; }\n  .table td,\n  .table th {\n    border: 1px solid #dbdbdb;\n    border-width: 0 0 1px;\n    padding: 0.5em 0.75em;\n    vertical-align: top; }\n    .table td.is-white,\n    .table th.is-white {\n      background-color: white;\n      border-color: white;\n      color: #0a0a0a; }\n    .table td.is-black,\n    .table th.is-black {\n      background-color: #0a0a0a;\n      border-color: #0a0a0a;\n      color: white; }\n    .table td.is-light,\n    .table th.is-light {\n      background-color: whitesmoke;\n      border-color: whitesmoke;\n      color: rgba(0, 0, 0, 0.7); }\n    .table td.is-dark,\n    .table th.is-dark {\n      background-color: #353A48;\n      border-color: #353A48;\n      color: #fff; }\n    .table td.is-primary,\n    .table th.is-primary {\n      background-color: #74BE43;\n      border-color: #74BE43;\n      color: #fff; }\n    .table td.is-link,\n    .table th.is-link {\n      background-color: #3273dc;\n      border-color: #3273dc;\n      color: #fff; }\n    .table td.is-info,\n    .table th.is-info {\n      background-color: #3298dc;\n      border-color: #3298dc;\n      color: #fff; }\n    .table td.is-success,\n    .table th.is-success {\n      background-color: #74BE43;\n      border-color: #74BE43;\n      color: #fff; }\n    .table td.is-warning,\n    .table th.is-warning {\n      background-color: #ffdd57;\n      border-color: #ffdd57;\n      color: rgba(0, 0, 0, 0.7); }\n    .table td.is-danger,\n    .table th.is-danger {\n      background-color: #f14668;\n      border-color: #f14668;\n      color: #fff; }\n    .table td.is-narrow,\n    .table th.is-narrow {\n      white-space: nowrap;\n      width: 1%; }\n    .table td.is-selected,\n    .table th.is-selected {\n      background-color: #74BE43;\n      color: #fff; }\n      .table td.is-selected a,\n      .table td.is-selected strong,\n      .table th.is-selected a,\n      .table th.is-selected strong {\n        color: currentColor; }\n  .table th {\n    color: #363636; }\n    .table th:not([align]) {\n      text-align: left; }\n  .table tr.is-selected {\n    background-color: #74BE43;\n    color: #fff; }\n    .table tr.is-selected a,\n    .table tr.is-selected strong {\n      color: currentColor; }\n    .table tr.is-selected td,\n    .table tr.is-selected th {\n      border-color: #fff;\n      color: currentColor; }\n  .table thead {\n    background-color: transparent; }\n    .table thead td,\n    .table thead th {\n      border-width: 0 0 2px;\n      color: #363636; }\n  .table tfoot {\n    background-color: transparent; }\n    .table tfoot td,\n    .table tfoot th {\n      border-width: 2px 0 0;\n      color: #363636; }\n  .table tbody {\n    background-color: transparent; }\n    .table tbody tr:last-child td,\n    .table tbody tr:last-child th {\n      border-bottom-width: 0; }\n  .table.is-bordered td,\n  .table.is-bordered th {\n    border-width: 1px; }\n  .table.is-bordered tr:last-child td,\n  .table.is-bordered tr:last-child th {\n    border-bottom-width: 1px; }\n  .table.is-fullwidth {\n    width: 100%; }\n  .table.is-hoverable tbody tr:not(.is-selected):hover {\n    background-color: #fafafa; }\n  .table.is-hoverable.is-striped tbody tr:not(.is-selected):hover {\n    background-color: #fafafa; }\n    .table.is-hoverable.is-striped tbody tr:not(.is-selected):hover:nth-child(even) {\n      background-color: whitesmoke; }\n  .table.is-narrow td,\n  .table.is-narrow th {\n    padding: 0.25em 0.5em; }\n  .table.is-striped tbody tr:not(.is-selected):nth-child(even) {\n    background-color: #fafafa; }\n\n.table-container {\n  -webkit-overflow-scrolling: touch;\n  overflow: auto;\n  overflow-y: hidden;\n  max-width: 100%; }\n\n.tags {\n  align-items: center;\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-start; }\n  .tags .tag {\n    margin-bottom: 0.5rem; }\n    .tags .tag:not(:last-child) {\n      margin-right: 0.5rem; }\n  .tags:last-child {\n    margin-bottom: -0.5rem; }\n  .tags:not(:last-child) {\n    margin-bottom: 1rem; }\n  .tags.are-medium .tag:not(.is-normal):not(.is-large) {\n    font-size: 1rem; }\n  .tags.are-large .tag:not(.is-normal):not(.is-medium) {\n    font-size: 1.25rem; }\n  .tags.is-centered {\n    justify-content: center; }\n    .tags.is-centered .tag {\n      margin-right: 0.25rem;\n      margin-left: 0.25rem; }\n  .tags.is-right {\n    justify-content: flex-end; }\n    .tags.is-right .tag:not(:first-child) {\n      margin-left: 0.5rem; }\n    .tags.is-right .tag:not(:last-child) {\n      margin-right: 0; }\n  .tags.has-addons .tag {\n    margin-right: 0; }\n    .tags.has-addons .tag:not(:first-child) {\n      margin-left: 0;\n      border-bottom-left-radius: 0;\n      border-top-left-radius: 0; }\n    .tags.has-addons .tag:not(:last-child) {\n      border-bottom-right-radius: 0;\n      border-top-right-radius: 0; }\n\n.tag:not(body) {\n  align-items: center;\n  background-color: whitesmoke;\n  border-radius: 4px;\n  color: #4a4a4a;\n  display: inline-flex;\n  font-size: 0.75rem;\n  height: 2em;\n  justify-content: center;\n  line-height: 1.5;\n  padding-left: 0.75em;\n  padding-right: 0.75em;\n  white-space: nowrap; }\n  .tag:not(body) .delete {\n    margin-left: 0.25rem;\n    margin-right: -0.375rem; }\n  .tag:not(body).is-white {\n    background-color: white;\n    color: #0a0a0a; }\n  .tag:not(body).is-black {\n    background-color: #0a0a0a;\n    color: white; }\n  .tag:not(body).is-light {\n    background-color: whitesmoke;\n    color: rgba(0, 0, 0, 0.7); }\n  .tag:not(body).is-dark {\n    background-color: #353A48;\n    color: #fff; }\n  .tag:not(body).is-primary {\n    background-color: #74BE43;\n    color: #fff; }\n    .tag:not(body).is-primary.is-light {\n      background-color: #f4faf0;\n      color: #4a792a; }\n  .tag:not(body).is-link {\n    background-color: #3273dc;\n    color: #fff; }\n    .tag:not(body).is-link.is-light {\n      background-color: #eef3fc;\n      color: #2160c4; }\n  .tag:not(body).is-info {\n    background-color: #3298dc;\n    color: #fff; }\n    .tag:not(body).is-info.is-light {\n      background-color: #eef6fc;\n      color: #1d72aa; }\n  .tag:not(body).is-success {\n    background-color: #74BE43;\n    color: #fff; }\n    .tag:not(body).is-success.is-light {\n      background-color: #f4faf0;\n      color: #4a792a; }\n  .tag:not(body).is-warning {\n    background-color: #ffdd57;\n    color: rgba(0, 0, 0, 0.7); }\n    .tag:not(body).is-warning.is-light {\n      background-color: #fffbeb;\n      color: #947600; }\n  .tag:not(body).is-danger {\n    background-color: #f14668;\n    color: #fff; }\n    .tag:not(body).is-danger.is-light {\n      background-color: #feecf0;\n      color: #cc0f35; }\n  .tag:not(body).is-normal {\n    font-size: 0.75rem; }\n  .tag:not(body).is-medium {\n    font-size: 1rem; }\n  .tag:not(body).is-large {\n    font-size: 1.25rem; }\n  .tag:not(body) .icon:first-child:not(:last-child) {\n    margin-left: -0.375em;\n    margin-right: 0.1875em; }\n  .tag:not(body) .icon:last-child:not(:first-child) {\n    margin-left: 0.1875em;\n    margin-right: -0.375em; }\n  .tag:not(body) .icon:first-child:last-child {\n    margin-left: -0.375em;\n    margin-right: -0.375em; }\n  .tag:not(body).is-delete {\n    margin-left: 1px;\n    padding: 0;\n    position: relative;\n    width: 2em; }\n    .tag:not(body).is-delete::before, .tag:not(body).is-delete::after {\n      background-color: currentColor;\n      content: \"\";\n      display: block;\n      left: 50%;\n      position: absolute;\n      top: 50%;\n      transform: translateX(-50%) translateY(-50%) rotate(45deg);\n      transform-origin: center center; }\n    .tag:not(body).is-delete::before {\n      height: 1px;\n      width: 50%; }\n    .tag:not(body).is-delete::after {\n      height: 50%;\n      width: 1px; }\n    .tag:not(body).is-delete:hover, .tag:not(body).is-delete:focus {\n      background-color: #e8e8e8; }\n    .tag:not(body).is-delete:active {\n      background-color: #dbdbdb; }\n  .tag:not(body).is-rounded {\n    border-radius: 290486px; }\n\na.tag:hover {\n  text-decoration: underline; }\n\n.title,\n.subtitle {\n  word-break: break-word; }\n  .title em,\n  .title span,\n  .subtitle em,\n  .subtitle span {\n    font-weight: inherit; }\n  .title sub,\n  .subtitle sub {\n    font-size: 0.75em; }\n  .title sup,\n  .subtitle sup {\n    font-size: 0.75em; }\n  .title .tag,\n  .subtitle .tag {\n    vertical-align: middle; }\n\n.title {\n  color: #363636;\n  font-size: 2rem;\n  font-weight: 600;\n  line-height: 1.125; }\n  .title strong {\n    color: inherit;\n    font-weight: inherit; }\n  .title + .highlight {\n    margin-top: -0.75rem; }\n  .title:not(.is-spaced) + .subtitle {\n    margin-top: -1.25rem; }\n  .title.is-1 {\n    font-size: 3rem; }\n  .title.is-2 {\n    font-size: 2.5rem; }\n  .title.is-3 {\n    font-size: 2rem; }\n  .title.is-4 {\n    font-size: 1.5rem; }\n  .title.is-5 {\n    font-size: 1.25rem; }\n  .title.is-6 {\n    font-size: 1rem; }\n  .title.is-7 {\n    font-size: 0.75rem; }\n\n.subtitle {\n  color: #4a4a4a;\n  font-size: 1.25rem;\n  font-weight: 400;\n  line-height: 1.25; }\n  .subtitle strong {\n    color: #363636;\n    font-weight: 600; }\n  .subtitle:not(.is-spaced) + .title {\n    margin-top: -1.25rem; }\n  .subtitle.is-1 {\n    font-size: 3rem; }\n  .subtitle.is-2 {\n    font-size: 2.5rem; }\n  .subtitle.is-3 {\n    font-size: 2rem; }\n  .subtitle.is-4 {\n    font-size: 1.5rem; }\n  .subtitle.is-5 {\n    font-size: 1.25rem; }\n  .subtitle.is-6 {\n    font-size: 1rem; }\n  .subtitle.is-7 {\n    font-size: 0.75rem; }\n\n.heading {\n  display: block;\n  font-size: 11px;\n  letter-spacing: 1px;\n  margin-bottom: 5px;\n  text-transform: uppercase; }\n\n.highlight {\n  font-weight: 400;\n  max-width: 100%;\n  overflow: hidden;\n  padding: 0; }\n  .highlight pre {\n    overflow: auto;\n    max-width: 100%; }\n\n.number {\n  align-items: center;\n  background-color: whitesmoke;\n  border-radius: 290486px;\n  display: inline-flex;\n  font-size: 1.25rem;\n  height: 2em;\n  justify-content: center;\n  margin-right: 1.5rem;\n  min-width: 2.5em;\n  padding: 0.25rem 0.5rem;\n  text-align: center;\n  vertical-align: top; }\n\n.input, .textarea, .select select {\n  background-color: white;\n  border-color: #dbdbdb;\n  border-radius: 4px;\n  color: #363636; }\n  .input::-moz-placeholder, .textarea::-moz-placeholder, .select select::-moz-placeholder {\n    color: rgba(54, 54, 54, 0.3); }\n  .input::-webkit-input-placeholder, .textarea::-webkit-input-placeholder, .select select::-webkit-input-placeholder {\n    color: rgba(54, 54, 54, 0.3); }\n  .input:-moz-placeholder, .textarea:-moz-placeholder, .select select:-moz-placeholder {\n    color: rgba(54, 54, 54, 0.3); }\n  .input:-ms-input-placeholder, .textarea:-ms-input-placeholder, .select select:-ms-input-placeholder {\n    color: rgba(54, 54, 54, 0.3); }\n  .input:hover, .textarea:hover, .select select:hover, .is-hovered.input, .is-hovered.textarea, .select select.is-hovered {\n    border-color: #b5b5b5; }\n  .input:focus, .textarea:focus, .select select:focus, .is-focused.input, .is-focused.textarea, .select select.is-focused, .input:active, .textarea:active, .select select:active, .is-active.input, .is-active.textarea, .select select.is-active {\n    border-color: #3273dc;\n    box-shadow: 0 0 0 0.125em rgba(50, 115, 220, 0.25); }\n  .input[disabled], .textarea[disabled], .select select[disabled],\n  fieldset[disabled] .input,\n  fieldset[disabled] .textarea,\n  fieldset[disabled] .select select,\n  .select fieldset[disabled] select {\n    background-color: whitesmoke;\n    border-color: whitesmoke;\n    box-shadow: none;\n    color: #7a7a7a; }\n    .input[disabled]::-moz-placeholder, .textarea[disabled]::-moz-placeholder, .select select[disabled]::-moz-placeholder,\n    fieldset[disabled] .input::-moz-placeholder,\n    fieldset[disabled] .textarea::-moz-placeholder,\n    fieldset[disabled] .select select::-moz-placeholder,\n    .select fieldset[disabled] select::-moz-placeholder {\n      color: rgba(122, 122, 122, 0.3); }\n    .input[disabled]::-webkit-input-placeholder, .textarea[disabled]::-webkit-input-placeholder, .select select[disabled]::-webkit-input-placeholder,\n    fieldset[disabled] .input::-webkit-input-placeholder,\n    fieldset[disabled] .textarea::-webkit-input-placeholder,\n    fieldset[disabled] .select select::-webkit-input-placeholder,\n    .select fieldset[disabled] select::-webkit-input-placeholder {\n      color: rgba(122, 122, 122, 0.3); }\n    .input[disabled]:-moz-placeholder, .textarea[disabled]:-moz-placeholder, .select select[disabled]:-moz-placeholder,\n    fieldset[disabled] .input:-moz-placeholder,\n    fieldset[disabled] .textarea:-moz-placeholder,\n    fieldset[disabled] .select select:-moz-placeholder,\n    .select fieldset[disabled] select:-moz-placeholder {\n      color: rgba(122, 122, 122, 0.3); }\n    .input[disabled]:-ms-input-placeholder, .textarea[disabled]:-ms-input-placeholder, .select select[disabled]:-ms-input-placeholder,\n    fieldset[disabled] .input:-ms-input-placeholder,\n    fieldset[disabled] .textarea:-ms-input-placeholder,\n    fieldset[disabled] .select select:-ms-input-placeholder,\n    .select fieldset[disabled] select:-ms-input-placeholder {\n      color: rgba(122, 122, 122, 0.3); }\n\n.input, .textarea {\n  box-shadow: inset 0 0.0625em 0.125em rgba(10, 10, 10, 0.05);\n  max-width: 100%;\n  width: 100%; }\n  .input[readonly], .textarea[readonly] {\n    box-shadow: none; }\n  .is-white.input, .is-white.textarea {\n    border-color: white; }\n    .is-white.input:focus, .is-white.textarea:focus, .is-white.is-focused.input, .is-white.is-focused.textarea, .is-white.input:active, .is-white.textarea:active, .is-white.is-active.input, .is-white.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(255, 255, 255, 0.25); }\n  .is-black.input, .is-black.textarea {\n    border-color: #0a0a0a; }\n    .is-black.input:focus, .is-black.textarea:focus, .is-black.is-focused.input, .is-black.is-focused.textarea, .is-black.input:active, .is-black.textarea:active, .is-black.is-active.input, .is-black.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(10, 10, 10, 0.25); }\n  .is-light.input, .is-light.textarea {\n    border-color: whitesmoke; }\n    .is-light.input:focus, .is-light.textarea:focus, .is-light.is-focused.input, .is-light.is-focused.textarea, .is-light.input:active, .is-light.textarea:active, .is-light.is-active.input, .is-light.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(245, 245, 245, 0.25); }\n  .is-dark.input, .is-dark.textarea {\n    border-color: #353A48; }\n    .is-dark.input:focus, .is-dark.textarea:focus, .is-dark.is-focused.input, .is-dark.is-focused.textarea, .is-dark.input:active, .is-dark.textarea:active, .is-dark.is-active.input, .is-dark.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(53, 58, 72, 0.25); }\n  .is-primary.input, .is-primary.textarea {\n    border-color: #74BE43; }\n    .is-primary.input:focus, .is-primary.textarea:focus, .is-primary.is-focused.input, .is-primary.is-focused.textarea, .is-primary.input:active, .is-primary.textarea:active, .is-primary.is-active.input, .is-primary.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(116, 190, 67, 0.25); }\n  .is-link.input, .is-link.textarea {\n    border-color: #3273dc; }\n    .is-link.input:focus, .is-link.textarea:focus, .is-link.is-focused.input, .is-link.is-focused.textarea, .is-link.input:active, .is-link.textarea:active, .is-link.is-active.input, .is-link.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(50, 115, 220, 0.25); }\n  .is-info.input, .is-info.textarea {\n    border-color: #3298dc; }\n    .is-info.input:focus, .is-info.textarea:focus, .is-info.is-focused.input, .is-info.is-focused.textarea, .is-info.input:active, .is-info.textarea:active, .is-info.is-active.input, .is-info.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(50, 152, 220, 0.25); }\n  .is-success.input, .is-success.textarea {\n    border-color: #74BE43; }\n    .is-success.input:focus, .is-success.textarea:focus, .is-success.is-focused.input, .is-success.is-focused.textarea, .is-success.input:active, .is-success.textarea:active, .is-success.is-active.input, .is-success.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(116, 190, 67, 0.25); }\n  .is-warning.input, .is-warning.textarea {\n    border-color: #ffdd57; }\n    .is-warning.input:focus, .is-warning.textarea:focus, .is-warning.is-focused.input, .is-warning.is-focused.textarea, .is-warning.input:active, .is-warning.textarea:active, .is-warning.is-active.input, .is-warning.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(255, 221, 87, 0.25); }\n  .is-danger.input, .is-danger.textarea {\n    border-color: #f14668; }\n    .is-danger.input:focus, .is-danger.textarea:focus, .is-danger.is-focused.input, .is-danger.is-focused.textarea, .is-danger.input:active, .is-danger.textarea:active, .is-danger.is-active.input, .is-danger.is-active.textarea {\n      box-shadow: 0 0 0 0.125em rgba(241, 70, 104, 0.25); }\n  .is-small.input, .is-small.textarea {\n    border-radius: 2px;\n    font-size: 0.75rem; }\n  .is-medium.input, .is-medium.textarea {\n    font-size: 1.25rem; }\n  .is-large.input, .is-large.textarea {\n    font-size: 1.5rem; }\n  .is-fullwidth.input, .is-fullwidth.textarea {\n    display: block;\n    width: 100%; }\n  .is-inline.input, .is-inline.textarea {\n    display: inline;\n    width: auto; }\n\n.input.is-rounded {\n  border-radius: 290486px;\n  padding-left: calc(calc(0.75em - 2px) + 0.375em);\n  padding-right: calc(calc(0.75em - 2px) + 0.375em); }\n\n.input.is-static {\n  background-color: transparent;\n  border-color: transparent;\n  box-shadow: none;\n  padding-left: 0;\n  padding-right: 0; }\n\n.textarea {\n  display: block;\n  max-width: 100%;\n  min-width: 100%;\n  padding: calc(0.75em - 2px);\n  resize: vertical; }\n  .textarea:not([rows]) {\n    max-height: 40em;\n    min-height: 8em; }\n  .textarea[rows] {\n    height: initial; }\n  .textarea.has-fixed-size {\n    resize: none; }\n\n.checkbox, .radio {\n  cursor: pointer;\n  display: inline-block;\n  line-height: 1.25;\n  position: relative; }\n  .checkbox input, .radio input {\n    cursor: pointer; }\n  .checkbox:hover, .radio:hover {\n    color: #363636; }\n  .checkbox[disabled], .radio[disabled],\n  fieldset[disabled] .checkbox,\n  fieldset[disabled] .radio {\n    color: #7a7a7a;\n    cursor: not-allowed; }\n\n.radio + .radio {\n  margin-left: 0.5em; }\n\n.select {\n  display: inline-block;\n  max-width: 100%;\n  position: relative;\n  vertical-align: top; }\n  .select:not(.is-multiple) {\n    height: 2.5em; }\n  .select:not(.is-multiple):not(.is-loading)::after {\n    border-color: #3273dc;\n    right: 1.125em;\n    z-index: 4; }\n  .select.is-rounded select {\n    border-radius: 290486px;\n    padding-left: 1em; }\n  .select select {\n    cursor: pointer;\n    display: block;\n    font-size: 1em;\n    max-width: 100%;\n    outline: none; }\n    .select select::-ms-expand {\n      display: none; }\n    .select select[disabled]:hover,\n    fieldset[disabled] .select select:hover {\n      border-color: whitesmoke; }\n    .select select:not([multiple]) {\n      padding-right: 2.5em; }\n    .select select[multiple] {\n      height: auto;\n      padding: 0; }\n      .select select[multiple] option {\n        padding: 0.5em 1em; }\n  .select:not(.is-multiple):not(.is-loading):hover::after {\n    border-color: #363636; }\n  .select.is-white:not(:hover)::after {\n    border-color: white; }\n  .select.is-white select {\n    border-color: white; }\n    .select.is-white select:hover, .select.is-white select.is-hovered {\n      border-color: #f2f2f2; }\n    .select.is-white select:focus, .select.is-white select.is-focused, .select.is-white select:active, .select.is-white select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(255, 255, 255, 0.25); }\n  .select.is-black:not(:hover)::after {\n    border-color: #0a0a0a; }\n  .select.is-black select {\n    border-color: #0a0a0a; }\n    .select.is-black select:hover, .select.is-black select.is-hovered {\n      border-color: black; }\n    .select.is-black select:focus, .select.is-black select.is-focused, .select.is-black select:active, .select.is-black select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(10, 10, 10, 0.25); }\n  .select.is-light:not(:hover)::after {\n    border-color: whitesmoke; }\n  .select.is-light select {\n    border-color: whitesmoke; }\n    .select.is-light select:hover, .select.is-light select.is-hovered {\n      border-color: #e8e8e8; }\n    .select.is-light select:focus, .select.is-light select.is-focused, .select.is-light select:active, .select.is-light select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(245, 245, 245, 0.25); }\n  .select.is-dark:not(:hover)::after {\n    border-color: #353A48; }\n  .select.is-dark select {\n    border-color: #353A48; }\n    .select.is-dark select:hover, .select.is-dark select.is-hovered {\n      border-color: #2a2e39; }\n    .select.is-dark select:focus, .select.is-dark select.is-focused, .select.is-dark select:active, .select.is-dark select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(53, 58, 72, 0.25); }\n  .select.is-primary:not(:hover)::after {\n    border-color: #74BE43; }\n  .select.is-primary select {\n    border-color: #74BE43; }\n    .select.is-primary select:hover, .select.is-primary select.is-hovered {\n      border-color: #68ac3b; }\n    .select.is-primary select:focus, .select.is-primary select.is-focused, .select.is-primary select:active, .select.is-primary select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(116, 190, 67, 0.25); }\n  .select.is-link:not(:hover)::after {\n    border-color: #3273dc; }\n  .select.is-link select {\n    border-color: #3273dc; }\n    .select.is-link select:hover, .select.is-link select.is-hovered {\n      border-color: #2366d1; }\n    .select.is-link select:focus, .select.is-link select.is-focused, .select.is-link select:active, .select.is-link select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(50, 115, 220, 0.25); }\n  .select.is-info:not(:hover)::after {\n    border-color: #3298dc; }\n  .select.is-info select {\n    border-color: #3298dc; }\n    .select.is-info select:hover, .select.is-info select.is-hovered {\n      border-color: #238cd1; }\n    .select.is-info select:focus, .select.is-info select.is-focused, .select.is-info select:active, .select.is-info select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(50, 152, 220, 0.25); }\n  .select.is-success:not(:hover)::after {\n    border-color: #74BE43; }\n  .select.is-success select {\n    border-color: #74BE43; }\n    .select.is-success select:hover, .select.is-success select.is-hovered {\n      border-color: #68ac3b; }\n    .select.is-success select:focus, .select.is-success select.is-focused, .select.is-success select:active, .select.is-success select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(116, 190, 67, 0.25); }\n  .select.is-warning:not(:hover)::after {\n    border-color: #ffdd57; }\n  .select.is-warning select {\n    border-color: #ffdd57; }\n    .select.is-warning select:hover, .select.is-warning select.is-hovered {\n      border-color: #ffd83d; }\n    .select.is-warning select:focus, .select.is-warning select.is-focused, .select.is-warning select:active, .select.is-warning select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(255, 221, 87, 0.25); }\n  .select.is-danger:not(:hover)::after {\n    border-color: #f14668; }\n  .select.is-danger select {\n    border-color: #f14668; }\n    .select.is-danger select:hover, .select.is-danger select.is-hovered {\n      border-color: #ef2e55; }\n    .select.is-danger select:focus, .select.is-danger select.is-focused, .select.is-danger select:active, .select.is-danger select.is-active {\n      box-shadow: 0 0 0 0.125em rgba(241, 70, 104, 0.25); }\n  .select.is-small {\n    border-radius: 2px;\n    font-size: 0.75rem; }\n  .select.is-medium {\n    font-size: 1.25rem; }\n  .select.is-large {\n    font-size: 1.5rem; }\n  .select.is-disabled::after {\n    border-color: #7a7a7a; }\n  .select.is-fullwidth {\n    width: 100%; }\n    .select.is-fullwidth select {\n      width: 100%; }\n  .select.is-loading::after {\n    margin-top: 0;\n    position: absolute;\n    right: 0.625em;\n    top: 0.625em;\n    transform: none; }\n  .select.is-loading.is-small:after {\n    font-size: 0.75rem; }\n  .select.is-loading.is-medium:after {\n    font-size: 1.25rem; }\n  .select.is-loading.is-large:after {\n    font-size: 1.5rem; }\n\n.file {\n  align-items: stretch;\n  display: flex;\n  justify-content: flex-start;\n  position: relative; }\n  .file.is-white .file-cta {\n    background-color: white;\n    border-color: transparent;\n    color: #0a0a0a; }\n  .file.is-white:hover .file-cta, .file.is-white.is-hovered .file-cta {\n    background-color: #f9f9f9;\n    border-color: transparent;\n    color: #0a0a0a; }\n  .file.is-white:focus .file-cta, .file.is-white.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(255, 255, 255, 0.25);\n    color: #0a0a0a; }\n  .file.is-white:active .file-cta, .file.is-white.is-active .file-cta {\n    background-color: #f2f2f2;\n    border-color: transparent;\n    color: #0a0a0a; }\n  .file.is-black .file-cta {\n    background-color: #0a0a0a;\n    border-color: transparent;\n    color: white; }\n  .file.is-black:hover .file-cta, .file.is-black.is-hovered .file-cta {\n    background-color: #040404;\n    border-color: transparent;\n    color: white; }\n  .file.is-black:focus .file-cta, .file.is-black.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(10, 10, 10, 0.25);\n    color: white; }\n  .file.is-black:active .file-cta, .file.is-black.is-active .file-cta {\n    background-color: black;\n    border-color: transparent;\n    color: white; }\n  .file.is-light .file-cta {\n    background-color: whitesmoke;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-light:hover .file-cta, .file.is-light.is-hovered .file-cta {\n    background-color: #eeeeee;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-light:focus .file-cta, .file.is-light.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(245, 245, 245, 0.25);\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-light:active .file-cta, .file.is-light.is-active .file-cta {\n    background-color: #e8e8e8;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-dark .file-cta {\n    background-color: #353A48;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-dark:hover .file-cta, .file.is-dark.is-hovered .file-cta {\n    background-color: #303441;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-dark:focus .file-cta, .file.is-dark.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(53, 58, 72, 0.25);\n    color: #fff; }\n  .file.is-dark:active .file-cta, .file.is-dark.is-active .file-cta {\n    background-color: #2a2e39;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-primary .file-cta {\n    background-color: #74BE43;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-primary:hover .file-cta, .file.is-primary.is-hovered .file-cta {\n    background-color: #6eb53f;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-primary:focus .file-cta, .file.is-primary.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(116, 190, 67, 0.25);\n    color: #fff; }\n  .file.is-primary:active .file-cta, .file.is-primary.is-active .file-cta {\n    background-color: #68ac3b;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-link .file-cta {\n    background-color: #3273dc;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-link:hover .file-cta, .file.is-link.is-hovered .file-cta {\n    background-color: #276cda;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-link:focus .file-cta, .file.is-link.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(50, 115, 220, 0.25);\n    color: #fff; }\n  .file.is-link:active .file-cta, .file.is-link.is-active .file-cta {\n    background-color: #2366d1;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-info .file-cta {\n    background-color: #3298dc;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-info:hover .file-cta, .file.is-info.is-hovered .file-cta {\n    background-color: #2793da;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-info:focus .file-cta, .file.is-info.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(50, 152, 220, 0.25);\n    color: #fff; }\n  .file.is-info:active .file-cta, .file.is-info.is-active .file-cta {\n    background-color: #238cd1;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-success .file-cta {\n    background-color: #74BE43;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-success:hover .file-cta, .file.is-success.is-hovered .file-cta {\n    background-color: #6eb53f;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-success:focus .file-cta, .file.is-success.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(116, 190, 67, 0.25);\n    color: #fff; }\n  .file.is-success:active .file-cta, .file.is-success.is-active .file-cta {\n    background-color: #68ac3b;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-warning .file-cta {\n    background-color: #ffdd57;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-warning:hover .file-cta, .file.is-warning.is-hovered .file-cta {\n    background-color: #ffdb4a;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-warning:focus .file-cta, .file.is-warning.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(255, 221, 87, 0.25);\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-warning:active .file-cta, .file.is-warning.is-active .file-cta {\n    background-color: #ffd83d;\n    border-color: transparent;\n    color: rgba(0, 0, 0, 0.7); }\n  .file.is-danger .file-cta {\n    background-color: #f14668;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-danger:hover .file-cta, .file.is-danger.is-hovered .file-cta {\n    background-color: #f03a5f;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-danger:focus .file-cta, .file.is-danger.is-focused .file-cta {\n    border-color: transparent;\n    box-shadow: 0 0 0.5em rgba(241, 70, 104, 0.25);\n    color: #fff; }\n  .file.is-danger:active .file-cta, .file.is-danger.is-active .file-cta {\n    background-color: #ef2e55;\n    border-color: transparent;\n    color: #fff; }\n  .file.is-small {\n    font-size: 0.75rem; }\n  .file.is-medium {\n    font-size: 1.25rem; }\n    .file.is-medium .file-icon .fa {\n      font-size: 21px; }\n  .file.is-large {\n    font-size: 1.5rem; }\n    .file.is-large .file-icon .fa {\n      font-size: 28px; }\n  .file.has-name .file-cta {\n    border-bottom-right-radius: 0;\n    border-top-right-radius: 0; }\n  .file.has-name .file-name {\n    border-bottom-left-radius: 0;\n    border-top-left-radius: 0; }\n  .file.has-name.is-empty .file-cta {\n    border-radius: 4px; }\n  .file.has-name.is-empty .file-name {\n    display: none; }\n  .file.is-boxed .file-label {\n    flex-direction: column; }\n  .file.is-boxed .file-cta {\n    flex-direction: column;\n    height: auto;\n    padding: 1em 3em; }\n  .file.is-boxed .file-name {\n    border-width: 0 1px 1px; }\n  .file.is-boxed .file-icon {\n    height: 1.5em;\n    width: 1.5em; }\n    .file.is-boxed .file-icon .fa {\n      font-size: 21px; }\n  .file.is-boxed.is-small .file-icon .fa {\n    font-size: 14px; }\n  .file.is-boxed.is-medium .file-icon .fa {\n    font-size: 28px; }\n  .file.is-boxed.is-large .file-icon .fa {\n    font-size: 35px; }\n  .file.is-boxed.has-name .file-cta {\n    border-radius: 4px 4px 0 0; }\n  .file.is-boxed.has-name .file-name {\n    border-radius: 0 0 4px 4px;\n    border-width: 0 1px 1px; }\n  .file.is-centered {\n    justify-content: center; }\n  .file.is-fullwidth .file-label {\n    width: 100%; }\n  .file.is-fullwidth .file-name {\n    flex-grow: 1;\n    max-width: none; }\n  .file.is-right {\n    justify-content: flex-end; }\n    .file.is-right .file-cta {\n      border-radius: 0 4px 4px 0; }\n    .file.is-right .file-name {\n      border-radius: 4px 0 0 4px;\n      border-width: 1px 0 1px 1px;\n      order: -1; }\n\n.file-label {\n  align-items: stretch;\n  display: flex;\n  cursor: pointer;\n  justify-content: flex-start;\n  overflow: hidden;\n  position: relative; }\n  .file-label:hover .file-cta {\n    background-color: #eeeeee;\n    color: #363636; }\n  .file-label:hover .file-name {\n    border-color: #d5d5d5; }\n  .file-label:active .file-cta {\n    background-color: #e8e8e8;\n    color: #363636; }\n  .file-label:active .file-name {\n    border-color: #cfcfcf; }\n\n.file-input {\n  height: 100%;\n  left: 0;\n  opacity: 0;\n  outline: none;\n  position: absolute;\n  top: 0;\n  width: 100%; }\n\n.file-cta,\n.file-name {\n  border-color: #dbdbdb;\n  border-radius: 4px;\n  font-size: 1em;\n  padding-left: 1em;\n  padding-right: 1em;\n  white-space: nowrap; }\n\n.file-cta {\n  background-color: whitesmoke;\n  color: #4a4a4a; }\n\n.file-name {\n  border-color: #dbdbdb;\n  border-style: solid;\n  border-width: 1px 1px 1px 0;\n  display: block;\n  max-width: 16em;\n  overflow: hidden;\n  text-align: left;\n  text-overflow: ellipsis; }\n\n.file-icon {\n  align-items: center;\n  display: flex;\n  height: 1em;\n  justify-content: center;\n  margin-right: 0.5em;\n  width: 1em; }\n  .file-icon .fa {\n    font-size: 14px; }\n\n.label {\n  color: #363636;\n  display: block;\n  font-size: 1rem;\n  font-weight: 700; }\n  .label:not(:last-child) {\n    margin-bottom: 0.5em; }\n  .label.is-small {\n    font-size: 0.75rem; }\n  .label.is-medium {\n    font-size: 1.25rem; }\n  .label.is-large {\n    font-size: 1.5rem; }\n\n.help {\n  display: block;\n  font-size: 0.75rem;\n  margin-top: 0.25rem; }\n  .help.is-white {\n    color: white; }\n  .help.is-black {\n    color: #0a0a0a; }\n  .help.is-light {\n    color: whitesmoke; }\n  .help.is-dark {\n    color: #353A48; }\n  .help.is-primary {\n    color: #74BE43; }\n  .help.is-link {\n    color: #3273dc; }\n  .help.is-info {\n    color: #3298dc; }\n  .help.is-success {\n    color: #74BE43; }\n  .help.is-warning {\n    color: #ffdd57; }\n  .help.is-danger {\n    color: #f14668; }\n\n.field:not(:last-child) {\n  margin-bottom: 0.75rem; }\n\n.field.has-addons {\n  display: flex;\n  justify-content: flex-start; }\n  .field.has-addons .control:not(:last-child) {\n    margin-right: -1px; }\n  .field.has-addons .control:not(:first-child):not(:last-child) .button,\n  .field.has-addons .control:not(:first-child):not(:last-child) .input,\n  .field.has-addons .control:not(:first-child):not(:last-child) .select select {\n    border-radius: 0; }\n  .field.has-addons .control:first-child:not(:only-child) .button,\n  .field.has-addons .control:first-child:not(:only-child) .input,\n  .field.has-addons .control:first-child:not(:only-child) .select select {\n    border-bottom-right-radius: 0;\n    border-top-right-radius: 0; }\n  .field.has-addons .control:last-child:not(:only-child) .button,\n  .field.has-addons .control:last-child:not(:only-child) .input,\n  .field.has-addons .control:last-child:not(:only-child) .select select {\n    border-bottom-left-radius: 0;\n    border-top-left-radius: 0; }\n  .field.has-addons .control .button:not([disabled]):hover, .field.has-addons .control .button:not([disabled]).is-hovered,\n  .field.has-addons .control .input:not([disabled]):hover,\n  .field.has-addons .control .input:not([disabled]).is-hovered,\n  .field.has-addons .control .select select:not([disabled]):hover,\n  .field.has-addons .control .select select:not([disabled]).is-hovered {\n    z-index: 2; }\n  .field.has-addons .control .button:not([disabled]):focus, .field.has-addons .control .button:not([disabled]).is-focused, .field.has-addons .control .button:not([disabled]):active, .field.has-addons .control .button:not([disabled]).is-active,\n  .field.has-addons .control .input:not([disabled]):focus,\n  .field.has-addons .control .input:not([disabled]).is-focused,\n  .field.has-addons .control .input:not([disabled]):active,\n  .field.has-addons .control .input:not([disabled]).is-active,\n  .field.has-addons .control .select select:not([disabled]):focus,\n  .field.has-addons .control .select select:not([disabled]).is-focused,\n  .field.has-addons .control .select select:not([disabled]):active,\n  .field.has-addons .control .select select:not([disabled]).is-active {\n    z-index: 3; }\n    .field.has-addons .control .button:not([disabled]):focus:hover, .field.has-addons .control .button:not([disabled]).is-focused:hover, .field.has-addons .control .button:not([disabled]):active:hover, .field.has-addons .control .button:not([disabled]).is-active:hover,\n    .field.has-addons .control .input:not([disabled]):focus:hover,\n    .field.has-addons .control .input:not([disabled]).is-focused:hover,\n    .field.has-addons .control .input:not([disabled]):active:hover,\n    .field.has-addons .control .input:not([disabled]).is-active:hover,\n    .field.has-addons .control .select select:not([disabled]):focus:hover,\n    .field.has-addons .control .select select:not([disabled]).is-focused:hover,\n    .field.has-addons .control .select select:not([disabled]):active:hover,\n    .field.has-addons .control .select select:not([disabled]).is-active:hover {\n      z-index: 4; }\n  .field.has-addons .control.is-expanded {\n    flex-grow: 1;\n    flex-shrink: 1; }\n  .field.has-addons.has-addons-centered {\n    justify-content: center; }\n  .field.has-addons.has-addons-right {\n    justify-content: flex-end; }\n  .field.has-addons.has-addons-fullwidth .control {\n    flex-grow: 1;\n    flex-shrink: 0; }\n\n.field.is-grouped {\n  display: flex;\n  justify-content: flex-start; }\n  .field.is-grouped > .control {\n    flex-shrink: 0; }\n    .field.is-grouped > .control:not(:last-child) {\n      margin-bottom: 0;\n      margin-right: 0.75rem; }\n    .field.is-grouped > .control.is-expanded {\n      flex-grow: 1;\n      flex-shrink: 1; }\n  .field.is-grouped.is-grouped-centered {\n    justify-content: center; }\n  .field.is-grouped.is-grouped-right {\n    justify-content: flex-end; }\n  .field.is-grouped.is-grouped-multiline {\n    flex-wrap: wrap; }\n    .field.is-grouped.is-grouped-multiline > .control:last-child, .field.is-grouped.is-grouped-multiline > .control:not(:last-child) {\n      margin-bottom: 0.75rem; }\n    .field.is-grouped.is-grouped-multiline:last-child {\n      margin-bottom: -0.75rem; }\n    .field.is-grouped.is-grouped-multiline:not(:last-child) {\n      margin-bottom: 0; }\n\n@media screen and (min-width: 769px), print {\n  .field.is-horizontal {\n    display: flex; } }\n\n.field-label .label {\n  font-size: inherit; }\n\n@media screen and (max-width: 768px) {\n  .field-label {\n    margin-bottom: 0.5rem; } }\n\n@media screen and (min-width: 769px), print {\n  .field-label {\n    flex-basis: 0;\n    flex-grow: 1;\n    flex-shrink: 0;\n    margin-right: 1.5rem;\n    text-align: right; }\n    .field-label.is-small {\n      font-size: 0.75rem;\n      padding-top: 0.375em; }\n    .field-label.is-normal {\n      padding-top: 0.375em; }\n    .field-label.is-medium {\n      font-size: 1.25rem;\n      padding-top: 0.375em; }\n    .field-label.is-large {\n      font-size: 1.5rem;\n      padding-top: 0.375em; } }\n\n.field-body .field .field {\n  margin-bottom: 0; }\n\n@media screen and (min-width: 769px), print {\n  .field-body {\n    display: flex;\n    flex-basis: 0;\n    flex-grow: 5;\n    flex-shrink: 1; }\n    .field-body .field {\n      margin-bottom: 0; }\n    .field-body > .field {\n      flex-shrink: 1; }\n      .field-body > .field:not(.is-narrow) {\n        flex-grow: 1; }\n      .field-body > .field:not(:last-child) {\n        margin-right: 0.75rem; } }\n\n.control {\n  box-sizing: border-box;\n  clear: both;\n  font-size: 1rem;\n  position: relative;\n  text-align: left; }\n  .control.has-icons-left .input:focus ~ .icon,\n  .control.has-icons-left .select:focus ~ .icon, .control.has-icons-right .input:focus ~ .icon,\n  .control.has-icons-right .select:focus ~ .icon {\n    color: #4a4a4a; }\n  .control.has-icons-left .input.is-small ~ .icon,\n  .control.has-icons-left .select.is-small ~ .icon, .control.has-icons-right .input.is-small ~ .icon,\n  .control.has-icons-right .select.is-small ~ .icon {\n    font-size: 0.75rem; }\n  .control.has-icons-left .input.is-medium ~ .icon,\n  .control.has-icons-left .select.is-medium ~ .icon, .control.has-icons-right .input.is-medium ~ .icon,\n  .control.has-icons-right .select.is-medium ~ .icon {\n    font-size: 1.25rem; }\n  .control.has-icons-left .input.is-large ~ .icon,\n  .control.has-icons-left .select.is-large ~ .icon, .control.has-icons-right .input.is-large ~ .icon,\n  .control.has-icons-right .select.is-large ~ .icon {\n    font-size: 1.5rem; }\n  .control.has-icons-left .icon, .control.has-icons-right .icon {\n    color: #dbdbdb;\n    height: 2.5em;\n    pointer-events: none;\n    position: absolute;\n    top: 0;\n    width: 2.5em;\n    z-index: 4; }\n  .control.has-icons-left .input,\n  .control.has-icons-left .select select {\n    padding-left: 2.5em; }\n  .control.has-icons-left .icon.is-left {\n    left: 0; }\n  .control.has-icons-right .input,\n  .control.has-icons-right .select select {\n    padding-right: 2.5em; }\n  .control.has-icons-right .icon.is-right {\n    right: 0; }\n  .control.is-loading::after {\n    position: absolute !important;\n    right: 0.625em;\n    top: 0.625em;\n    z-index: 4; }\n  .control.is-loading.is-small:after {\n    font-size: 0.75rem; }\n  .control.is-loading.is-medium:after {\n    font-size: 1.25rem; }\n  .control.is-loading.is-large:after {\n    font-size: 1.5rem; }\n\n.column {\n  display: block;\n  flex-basis: 0;\n  flex-grow: 1;\n  flex-shrink: 1;\n  padding: 0.75rem; }\n  .columns.is-mobile > .column.is-narrow {\n    flex: none; }\n  .columns.is-mobile > .column.is-full {\n    flex: none;\n    width: 100%; }\n  .columns.is-mobile > .column.is-three-quarters {\n    flex: none;\n    width: 75%; }\n  .columns.is-mobile > .column.is-two-thirds {\n    flex: none;\n    width: 66.6666%; }\n  .columns.is-mobile > .column.is-half {\n    flex: none;\n    width: 50%; }\n  .columns.is-mobile > .column.is-one-third {\n    flex: none;\n    width: 33.3333%; }\n  .columns.is-mobile > .column.is-one-quarter {\n    flex: none;\n    width: 25%; }\n  .columns.is-mobile > .column.is-one-fifth {\n    flex: none;\n    width: 20%; }\n  .columns.is-mobile > .column.is-two-fifths {\n    flex: none;\n    width: 40%; }\n  .columns.is-mobile > .column.is-three-fifths {\n    flex: none;\n    width: 60%; }\n  .columns.is-mobile > .column.is-four-fifths {\n    flex: none;\n    width: 80%; }\n  .columns.is-mobile > .column.is-offset-three-quarters {\n    margin-left: 75%; }\n  .columns.is-mobile > .column.is-offset-two-thirds {\n    margin-left: 66.6666%; }\n  .columns.is-mobile > .column.is-offset-half {\n    margin-left: 50%; }\n  .columns.is-mobile > .column.is-offset-one-third {\n    margin-left: 33.3333%; }\n  .columns.is-mobile > .column.is-offset-one-quarter {\n    margin-left: 25%; }\n  .columns.is-mobile > .column.is-offset-one-fifth {\n    margin-left: 20%; }\n  .columns.is-mobile > .column.is-offset-two-fifths {\n    margin-left: 40%; }\n  .columns.is-mobile > .column.is-offset-three-fifths {\n    margin-left: 60%; }\n  .columns.is-mobile > .column.is-offset-four-fifths {\n    margin-left: 80%; }\n  .columns.is-mobile > .column.is-0 {\n    flex: none;\n    width: 0%; }\n  .columns.is-mobile > .column.is-offset-0 {\n    margin-left: 0%; }\n  .columns.is-mobile > .column.is-1 {\n    flex: none;\n    width: 8.33333%; }\n  .columns.is-mobile > .column.is-offset-1 {\n    margin-left: 8.33333%; }\n  .columns.is-mobile > .column.is-2 {\n    flex: none;\n    width: 16.66667%; }\n  .columns.is-mobile > .column.is-offset-2 {\n    margin-left: 16.66667%; }\n  .columns.is-mobile > .column.is-3 {\n    flex: none;\n    width: 25%; }\n  .columns.is-mobile > .column.is-offset-3 {\n    margin-left: 25%; }\n  .columns.is-mobile > .column.is-4 {\n    flex: none;\n    width: 33.33333%; }\n  .columns.is-mobile > .column.is-offset-4 {\n    margin-left: 33.33333%; }\n  .columns.is-mobile > .column.is-5 {\n    flex: none;\n    width: 41.66667%; }\n  .columns.is-mobile > .column.is-offset-5 {\n    margin-left: 41.66667%; }\n  .columns.is-mobile > .column.is-6 {\n    flex: none;\n    width: 50%; }\n  .columns.is-mobile > .column.is-offset-6 {\n    margin-left: 50%; }\n  .columns.is-mobile > .column.is-7 {\n    flex: none;\n    width: 58.33333%; }\n  .columns.is-mobile > .column.is-offset-7 {\n    margin-left: 58.33333%; }\n  .columns.is-mobile > .column.is-8 {\n    flex: none;\n    width: 66.66667%; }\n  .columns.is-mobile > .column.is-offset-8 {\n    margin-left: 66.66667%; }\n  .columns.is-mobile > .column.is-9 {\n    flex: none;\n    width: 75%; }\n  .columns.is-mobile > .column.is-offset-9 {\n    margin-left: 75%; }\n  .columns.is-mobile > .column.is-10 {\n    flex: none;\n    width: 83.33333%; }\n  .columns.is-mobile > .column.is-offset-10 {\n    margin-left: 83.33333%; }\n  .columns.is-mobile > .column.is-11 {\n    flex: none;\n    width: 91.66667%; }\n  .columns.is-mobile > .column.is-offset-11 {\n    margin-left: 91.66667%; }\n  .columns.is-mobile > .column.is-12 {\n    flex: none;\n    width: 100%; }\n  .columns.is-mobile > .column.is-offset-12 {\n    margin-left: 100%; }\n  @media screen and (max-width: 768px) {\n    .column.is-narrow-mobile {\n      flex: none; }\n    .column.is-full-mobile {\n      flex: none;\n      width: 100%; }\n    .column.is-three-quarters-mobile {\n      flex: none;\n      width: 75%; }\n    .column.is-two-thirds-mobile {\n      flex: none;\n      width: 66.6666%; }\n    .column.is-half-mobile {\n      flex: none;\n      width: 50%; }\n    .column.is-one-third-mobile {\n      flex: none;\n      width: 33.3333%; }\n    .column.is-one-quarter-mobile {\n      flex: none;\n      width: 25%; }\n    .column.is-one-fifth-mobile {\n      flex: none;\n      width: 20%; }\n    .column.is-two-fifths-mobile {\n      flex: none;\n      width: 40%; }\n    .column.is-three-fifths-mobile {\n      flex: none;\n      width: 60%; }\n    .column.is-four-fifths-mobile {\n      flex: none;\n      width: 80%; }\n    .column.is-offset-three-quarters-mobile {\n      margin-left: 75%; }\n    .column.is-offset-two-thirds-mobile {\n      margin-left: 66.6666%; }\n    .column.is-offset-half-mobile {\n      margin-left: 50%; }\n    .column.is-offset-one-third-mobile {\n      margin-left: 33.3333%; }\n    .column.is-offset-one-quarter-mobile {\n      margin-left: 25%; }\n    .column.is-offset-one-fifth-mobile {\n      margin-left: 20%; }\n    .column.is-offset-two-fifths-mobile {\n      margin-left: 40%; }\n    .column.is-offset-three-fifths-mobile {\n      margin-left: 60%; }\n    .column.is-offset-four-fifths-mobile {\n      margin-left: 80%; }\n    .column.is-0-mobile {\n      flex: none;\n      width: 0%; }\n    .column.is-offset-0-mobile {\n      margin-left: 0%; }\n    .column.is-1-mobile {\n      flex: none;\n      width: 8.33333%; }\n    .column.is-offset-1-mobile {\n      margin-left: 8.33333%; }\n    .column.is-2-mobile {\n      flex: none;\n      width: 16.66667%; }\n    .column.is-offset-2-mobile {\n      margin-left: 16.66667%; }\n    .column.is-3-mobile {\n      flex: none;\n      width: 25%; }\n    .column.is-offset-3-mobile {\n      margin-left: 25%; }\n    .column.is-4-mobile {\n      flex: none;\n      width: 33.33333%; }\n    .column.is-offset-4-mobile {\n      margin-left: 33.33333%; }\n    .column.is-5-mobile {\n      flex: none;\n      width: 41.66667%; }\n    .column.is-offset-5-mobile {\n      margin-left: 41.66667%; }\n    .column.is-6-mobile {\n      flex: none;\n      width: 50%; }\n    .column.is-offset-6-mobile {\n      margin-left: 50%; }\n    .column.is-7-mobile {\n      flex: none;\n      width: 58.33333%; }\n    .column.is-offset-7-mobile {\n      margin-left: 58.33333%; }\n    .column.is-8-mobile {\n      flex: none;\n      width: 66.66667%; }\n    .column.is-offset-8-mobile {\n      margin-left: 66.66667%; }\n    .column.is-9-mobile {\n      flex: none;\n      width: 75%; }\n    .column.is-offset-9-mobile {\n      margin-left: 75%; }\n    .column.is-10-mobile {\n      flex: none;\n      width: 83.33333%; }\n    .column.is-offset-10-mobile {\n      margin-left: 83.33333%; }\n    .column.is-11-mobile {\n      flex: none;\n      width: 91.66667%; }\n    .column.is-offset-11-mobile {\n      margin-left: 91.66667%; }\n    .column.is-12-mobile {\n      flex: none;\n      width: 100%; }\n    .column.is-offset-12-mobile {\n      margin-left: 100%; } }\n  @media screen and (min-width: 769px), print {\n    .column.is-narrow, .column.is-narrow-tablet {\n      flex: none; }\n    .column.is-full, .column.is-full-tablet {\n      flex: none;\n      width: 100%; }\n    .column.is-three-quarters, .column.is-three-quarters-tablet {\n      flex: none;\n      width: 75%; }\n    .column.is-two-thirds, .column.is-two-thirds-tablet {\n      flex: none;\n      width: 66.6666%; }\n    .column.is-half, .column.is-half-tablet {\n      flex: none;\n      width: 50%; }\n    .column.is-one-third, .column.is-one-third-tablet {\n      flex: none;\n      width: 33.3333%; }\n    .column.is-one-quarter, .column.is-one-quarter-tablet {\n      flex: none;\n      width: 25%; }\n    .column.is-one-fifth, .column.is-one-fifth-tablet {\n      flex: none;\n      width: 20%; }\n    .column.is-two-fifths, .column.is-two-fifths-tablet {\n      flex: none;\n      width: 40%; }\n    .column.is-three-fifths, .column.is-three-fifths-tablet {\n      flex: none;\n      width: 60%; }\n    .column.is-four-fifths, .column.is-four-fifths-tablet {\n      flex: none;\n      width: 80%; }\n    .column.is-offset-three-quarters, .column.is-offset-three-quarters-tablet {\n      margin-left: 75%; }\n    .column.is-offset-two-thirds, .column.is-offset-two-thirds-tablet {\n      margin-left: 66.6666%; }\n    .column.is-offset-half, .column.is-offset-half-tablet {\n      margin-left: 50%; }\n    .column.is-offset-one-third, .column.is-offset-one-third-tablet {\n      margin-left: 33.3333%; }\n    .column.is-offset-one-quarter, .column.is-offset-one-quarter-tablet {\n      margin-left: 25%; }\n    .column.is-offset-one-fifth, .column.is-offset-one-fifth-tablet {\n      margin-left: 20%; }\n    .column.is-offset-two-fifths, .column.is-offset-two-fifths-tablet {\n      margin-left: 40%; }\n    .column.is-offset-three-fifths, .column.is-offset-three-fifths-tablet {\n      margin-left: 60%; }\n    .column.is-offset-four-fifths, .column.is-offset-four-fifths-tablet {\n      margin-left: 80%; }\n    .column.is-0, .column.is-0-tablet {\n      flex: none;\n      width: 0%; }\n    .column.is-offset-0, .column.is-offset-0-tablet {\n      margin-left: 0%; }\n    .column.is-1, .column.is-1-tablet {\n      flex: none;\n      width: 8.33333%; }\n    .column.is-offset-1, .column.is-offset-1-tablet {\n      margin-left: 8.33333%; }\n    .column.is-2, .column.is-2-tablet {\n      flex: none;\n      width: 16.66667%; }\n    .column.is-offset-2, .column.is-offset-2-tablet {\n      margin-left: 16.66667%; }\n    .column.is-3, .column.is-3-tablet {\n      flex: none;\n      width: 25%; }\n    .column.is-offset-3, .column.is-offset-3-tablet {\n      margin-left: 25%; }\n    .column.is-4, .column.is-4-tablet {\n      flex: none;\n      width: 33.33333%; }\n    .column.is-offset-4, .column.is-offset-4-tablet {\n      margin-left: 33.33333%; }\n    .column.is-5, .column.is-5-tablet {\n      flex: none;\n      width: 41.66667%; }\n    .column.is-offset-5, .column.is-offset-5-tablet {\n      margin-left: 41.66667%; }\n    .column.is-6, .column.is-6-tablet {\n      flex: none;\n      width: 50%; }\n    .column.is-offset-6, .column.is-offset-6-tablet {\n      margin-left: 50%; }\n    .column.is-7, .column.is-7-tablet {\n      flex: none;\n      width: 58.33333%; }\n    .column.is-offset-7, .column.is-offset-7-tablet {\n      margin-left: 58.33333%; }\n    .column.is-8, .column.is-8-tablet {\n      flex: none;\n      width: 66.66667%; }\n    .column.is-offset-8, .column.is-offset-8-tablet {\n      margin-left: 66.66667%; }\n    .column.is-9, .column.is-9-tablet {\n      flex: none;\n      width: 75%; }\n    .column.is-offset-9, .column.is-offset-9-tablet {\n      margin-left: 75%; }\n    .column.is-10, .column.is-10-tablet {\n      flex: none;\n      width: 83.33333%; }\n    .column.is-offset-10, .column.is-offset-10-tablet {\n      margin-left: 83.33333%; }\n    .column.is-11, .column.is-11-tablet {\n      flex: none;\n      width: 91.66667%; }\n    .column.is-offset-11, .column.is-offset-11-tablet {\n      margin-left: 91.66667%; }\n    .column.is-12, .column.is-12-tablet {\n      flex: none;\n      width: 100%; }\n    .column.is-offset-12, .column.is-offset-12-tablet {\n      margin-left: 100%; } }\n  @media screen and (max-width: 1023px) {\n    .column.is-narrow-touch {\n      flex: none; }\n    .column.is-full-touch {\n      flex: none;\n      width: 100%; }\n    .column.is-three-quarters-touch {\n      flex: none;\n      width: 75%; }\n    .column.is-two-thirds-touch {\n      flex: none;\n      width: 66.6666%; }\n    .column.is-half-touch {\n      flex: none;\n      width: 50%; }\n    .column.is-one-third-touch {\n      flex: none;\n      width: 33.3333%; }\n    .column.is-one-quarter-touch {\n      flex: none;\n      width: 25%; }\n    .column.is-one-fifth-touch {\n      flex: none;\n      width: 20%; }\n    .column.is-two-fifths-touch {\n      flex: none;\n      width: 40%; }\n    .column.is-three-fifths-touch {\n      flex: none;\n      width: 60%; }\n    .column.is-four-fifths-touch {\n      flex: none;\n      width: 80%; }\n    .column.is-offset-three-quarters-touch {\n      margin-left: 75%; }\n    .column.is-offset-two-thirds-touch {\n      margin-left: 66.6666%; }\n    .column.is-offset-half-touch {\n      margin-left: 50%; }\n    .column.is-offset-one-third-touch {\n      margin-left: 33.3333%; }\n    .column.is-offset-one-quarter-touch {\n      margin-left: 25%; }\n    .column.is-offset-one-fifth-touch {\n      margin-left: 20%; }\n    .column.is-offset-two-fifths-touch {\n      margin-left: 40%; }\n    .column.is-offset-three-fifths-touch {\n      margin-left: 60%; }\n    .column.is-offset-four-fifths-touch {\n      margin-left: 80%; }\n    .column.is-0-touch {\n      flex: none;\n      width: 0%; }\n    .column.is-offset-0-touch {\n      margin-left: 0%; }\n    .column.is-1-touch {\n      flex: none;\n      width: 8.33333%; }\n    .column.is-offset-1-touch {\n      margin-left: 8.33333%; }\n    .column.is-2-touch {\n      flex: none;\n      width: 16.66667%; }\n    .column.is-offset-2-touch {\n      margin-left: 16.66667%; }\n    .column.is-3-touch {\n      flex: none;\n      width: 25%; }\n    .column.is-offset-3-touch {\n      margin-left: 25%; }\n    .column.is-4-touch {\n      flex: none;\n      width: 33.33333%; }\n    .column.is-offset-4-touch {\n      margin-left: 33.33333%; }\n    .column.is-5-touch {\n      flex: none;\n      width: 41.66667%; }\n    .column.is-offset-5-touch {\n      margin-left: 41.66667%; }\n    .column.is-6-touch {\n      flex: none;\n      width: 50%; }\n    .column.is-offset-6-touch {\n      margin-left: 50%; }\n    .column.is-7-touch {\n      flex: none;\n      width: 58.33333%; }\n    .column.is-offset-7-touch {\n      margin-left: 58.33333%; }\n    .column.is-8-touch {\n      flex: none;\n      width: 66.66667%; }\n    .column.is-offset-8-touch {\n      margin-left: 66.66667%; }\n    .column.is-9-touch {\n      flex: none;\n      width: 75%; }\n    .column.is-offset-9-touch {\n      margin-left: 75%; }\n    .column.is-10-touch {\n      flex: none;\n      width: 83.33333%; }\n    .column.is-offset-10-touch {\n      margin-left: 83.33333%; }\n    .column.is-11-touch {\n      flex: none;\n      width: 91.66667%; }\n    .column.is-offset-11-touch {\n      margin-left: 91.66667%; }\n    .column.is-12-touch {\n      flex: none;\n      width: 100%; }\n    .column.is-offset-12-touch {\n      margin-left: 100%; } }\n  @media screen and (min-width: 1024px) {\n    .column.is-narrow-desktop {\n      flex: none; }\n    .column.is-full-desktop {\n      flex: none;\n      width: 100%; }\n    .column.is-three-quarters-desktop {\n      flex: none;\n      width: 75%; }\n    .column.is-two-thirds-desktop {\n      flex: none;\n      width: 66.6666%; }\n    .column.is-half-desktop {\n      flex: none;\n      width: 50%; }\n    .column.is-one-third-desktop {\n      flex: none;\n      width: 33.3333%; }\n    .column.is-one-quarter-desktop {\n      flex: none;\n      width: 25%; }\n    .column.is-one-fifth-desktop {\n      flex: none;\n      width: 20%; }\n    .column.is-two-fifths-desktop {\n      flex: none;\n      width: 40%; }\n    .column.is-three-fifths-desktop {\n      flex: none;\n      width: 60%; }\n    .column.is-four-fifths-desktop {\n      flex: none;\n      width: 80%; }\n    .column.is-offset-three-quarters-desktop {\n      margin-left: 75%; }\n    .column.is-offset-two-thirds-desktop {\n      margin-left: 66.6666%; }\n    .column.is-offset-half-desktop {\n      margin-left: 50%; }\n    .column.is-offset-one-third-desktop {\n      margin-left: 33.3333%; }\n    .column.is-offset-one-quarter-desktop {\n      margin-left: 25%; }\n    .column.is-offset-one-fifth-desktop {\n      margin-left: 20%; }\n    .column.is-offset-two-fifths-desktop {\n      margin-left: 40%; }\n    .column.is-offset-three-fifths-desktop {\n      margin-left: 60%; }\n    .column.is-offset-four-fifths-desktop {\n      margin-left: 80%; }\n    .column.is-0-desktop {\n      flex: none;\n      width: 0%; }\n    .column.is-offset-0-desktop {\n      margin-left: 0%; }\n    .column.is-1-desktop {\n      flex: none;\n      width: 8.33333%; }\n    .column.is-offset-1-desktop {\n      margin-left: 8.33333%; }\n    .column.is-2-desktop {\n      flex: none;\n      width: 16.66667%; }\n    .column.is-offset-2-desktop {\n      margin-left: 16.66667%; }\n    .column.is-3-desktop {\n      flex: none;\n      width: 25%; }\n    .column.is-offset-3-desktop {\n      margin-left: 25%; }\n    .column.is-4-desktop {\n      flex: none;\n      width: 33.33333%; }\n    .column.is-offset-4-desktop {\n      margin-left: 33.33333%; }\n    .column.is-5-desktop {\n      flex: none;\n      width: 41.66667%; }\n    .column.is-offset-5-desktop {\n      margin-left: 41.66667%; }\n    .column.is-6-desktop {\n      flex: none;\n      width: 50%; }\n    .column.is-offset-6-desktop {\n      margin-left: 50%; }\n    .column.is-7-desktop {\n      flex: none;\n      width: 58.33333%; }\n    .column.is-offset-7-desktop {\n      margin-left: 58.33333%; }\n    .column.is-8-desktop {\n      flex: none;\n      width: 66.66667%; }\n    .column.is-offset-8-desktop {\n      margin-left: 66.66667%; }\n    .column.is-9-desktop {\n      flex: none;\n      width: 75%; }\n    .column.is-offset-9-desktop {\n      margin-left: 75%; }\n    .column.is-10-desktop {\n      flex: none;\n      width: 83.33333%; }\n    .column.is-offset-10-desktop {\n      margin-left: 83.33333%; }\n    .column.is-11-desktop {\n      flex: none;\n      width: 91.66667%; }\n    .column.is-offset-11-desktop {\n      margin-left: 91.66667%; }\n    .column.is-12-desktop {\n      flex: none;\n      width: 100%; }\n    .column.is-offset-12-desktop {\n      margin-left: 100%; } }\n\n.columns {\n  margin-left: -0.75rem;\n  margin-right: -0.75rem;\n  margin-top: -0.75rem; }\n  .columns:last-child {\n    margin-bottom: -0.75rem; }\n  .columns:not(:last-child) {\n    margin-bottom: calc(1.5rem - 0.75rem); }\n  .columns.is-centered {\n    justify-content: center; }\n  .columns.is-gapless {\n    margin-left: 0;\n    margin-right: 0;\n    margin-top: 0; }\n    .columns.is-gapless > .column {\n      margin: 0;\n      padding: 0 !important; }\n    .columns.is-gapless:not(:last-child) {\n      margin-bottom: 1.5rem; }\n    .columns.is-gapless:last-child {\n      margin-bottom: 0; }\n  .columns.is-mobile {\n    display: flex; }\n  .columns.is-multiline {\n    flex-wrap: wrap; }\n  .columns.is-vcentered {\n    align-items: center; }\n  @media screen and (min-width: 769px), print {\n    .columns:not(.is-desktop) {\n      display: flex; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-desktop {\n      display: flex; } }\n\n.columns.is-variable {\n  --columnGap: 0.75rem;\n  margin-left: calc(-1 * var(--columnGap));\n  margin-right: calc(-1 * var(--columnGap)); }\n  .columns.is-variable .column {\n    padding-left: var(--columnGap);\n    padding-right: var(--columnGap); }\n  .columns.is-variable.is-0 {\n    --columnGap: 0rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-0-mobile {\n      --columnGap: 0rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-0-tablet {\n      --columnGap: 0rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-0-tablet-only {\n      --columnGap: 0rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-0-touch {\n      --columnGap: 0rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-0-desktop {\n      --columnGap: 0rem; } }\n  .columns.is-variable.is-1 {\n    --columnGap: 0.25rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-1-mobile {\n      --columnGap: 0.25rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-1-tablet {\n      --columnGap: 0.25rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-1-tablet-only {\n      --columnGap: 0.25rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-1-touch {\n      --columnGap: 0.25rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-1-desktop {\n      --columnGap: 0.25rem; } }\n  .columns.is-variable.is-2 {\n    --columnGap: 0.5rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-2-mobile {\n      --columnGap: 0.5rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-2-tablet {\n      --columnGap: 0.5rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-2-tablet-only {\n      --columnGap: 0.5rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-2-touch {\n      --columnGap: 0.5rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-2-desktop {\n      --columnGap: 0.5rem; } }\n  .columns.is-variable.is-3 {\n    --columnGap: 0.75rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-3-mobile {\n      --columnGap: 0.75rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-3-tablet {\n      --columnGap: 0.75rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-3-tablet-only {\n      --columnGap: 0.75rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-3-touch {\n      --columnGap: 0.75rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-3-desktop {\n      --columnGap: 0.75rem; } }\n  .columns.is-variable.is-4 {\n    --columnGap: 1rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-4-mobile {\n      --columnGap: 1rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-4-tablet {\n      --columnGap: 1rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-4-tablet-only {\n      --columnGap: 1rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-4-touch {\n      --columnGap: 1rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-4-desktop {\n      --columnGap: 1rem; } }\n  .columns.is-variable.is-5 {\n    --columnGap: 1.25rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-5-mobile {\n      --columnGap: 1.25rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-5-tablet {\n      --columnGap: 1.25rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-5-tablet-only {\n      --columnGap: 1.25rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-5-touch {\n      --columnGap: 1.25rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-5-desktop {\n      --columnGap: 1.25rem; } }\n  .columns.is-variable.is-6 {\n    --columnGap: 1.5rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-6-mobile {\n      --columnGap: 1.5rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-6-tablet {\n      --columnGap: 1.5rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-6-tablet-only {\n      --columnGap: 1.5rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-6-touch {\n      --columnGap: 1.5rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-6-desktop {\n      --columnGap: 1.5rem; } }\n  .columns.is-variable.is-7 {\n    --columnGap: 1.75rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-7-mobile {\n      --columnGap: 1.75rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-7-tablet {\n      --columnGap: 1.75rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-7-tablet-only {\n      --columnGap: 1.75rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-7-touch {\n      --columnGap: 1.75rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-7-desktop {\n      --columnGap: 1.75rem; } }\n  .columns.is-variable.is-8 {\n    --columnGap: 2rem; }\n  @media screen and (max-width: 768px) {\n    .columns.is-variable.is-8-mobile {\n      --columnGap: 2rem; } }\n  @media screen and (min-width: 769px), print {\n    .columns.is-variable.is-8-tablet {\n      --columnGap: 2rem; } }\n  @media screen and (min-width: 769px) and (max-width: 1023px) {\n    .columns.is-variable.is-8-tablet-only {\n      --columnGap: 2rem; } }\n  @media screen and (max-width: 1023px) {\n    .columns.is-variable.is-8-touch {\n      --columnGap: 2rem; } }\n  @media screen and (min-width: 1024px) {\n    .columns.is-variable.is-8-desktop {\n      --columnGap: 2rem; } }\n\n.tile {\n  align-items: stretch;\n  display: block;\n  flex-basis: 0;\n  flex-grow: 1;\n  flex-shrink: 1;\n  min-height: min-content; }\n  .tile.is-ancestor {\n    margin-left: -0.75rem;\n    margin-right: -0.75rem;\n    margin-top: -0.75rem; }\n    .tile.is-ancestor:last-child {\n      margin-bottom: -0.75rem; }\n    .tile.is-ancestor:not(:last-child) {\n      margin-bottom: 0.75rem; }\n  .tile.is-child {\n    margin: 0 !important; }\n  .tile.is-parent {\n    padding: 0.75rem; }\n  .tile.is-vertical {\n    flex-direction: column; }\n    .tile.is-vertical > .tile.is-child:not(:last-child) {\n      margin-bottom: 1.5rem !important; }\n  @media screen and (min-width: 769px), print {\n    .tile:not(.is-child) {\n      display: flex; }\n    .tile.is-1 {\n      flex: none;\n      width: 8.33333%; }\n    .tile.is-2 {\n      flex: none;\n      width: 16.66667%; }\n    .tile.is-3 {\n      flex: none;\n      width: 25%; }\n    .tile.is-4 {\n      flex: none;\n      width: 33.33333%; }\n    .tile.is-5 {\n      flex: none;\n      width: 41.66667%; }\n    .tile.is-6 {\n      flex: none;\n      width: 50%; }\n    .tile.is-7 {\n      flex: none;\n      width: 58.33333%; }\n    .tile.is-8 {\n      flex: none;\n      width: 66.66667%; }\n    .tile.is-9 {\n      flex: none;\n      width: 75%; }\n    .tile.is-10 {\n      flex: none;\n      width: 83.33333%; }\n    .tile.is-11 {\n      flex: none;\n      width: 91.66667%; }\n    .tile.is-12 {\n      flex: none;\n      width: 100%; } }\n\n.hero {\n  align-items: stretch;\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between; }\n  .hero .navbar {\n    background: none; }\n  .hero .tabs ul {\n    border-bottom: none; }\n  .hero.is-white {\n    background-color: white;\n    color: #0a0a0a; }\n    .hero.is-white a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-white strong {\n      color: inherit; }\n    .hero.is-white .title {\n      color: #0a0a0a; }\n    .hero.is-white .subtitle {\n      color: rgba(10, 10, 10, 0.9); }\n      .hero.is-white .subtitle a:not(.button),\n      .hero.is-white .subtitle strong {\n        color: #0a0a0a; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-white .navbar-menu {\n        background-color: white; } }\n    .hero.is-white .navbar-item,\n    .hero.is-white .navbar-link {\n      color: rgba(10, 10, 10, 0.7); }\n    .hero.is-white a.navbar-item:hover, .hero.is-white a.navbar-item.is-active,\n    .hero.is-white .navbar-link:hover,\n    .hero.is-white .navbar-link.is-active {\n      background-color: #f2f2f2;\n      color: #0a0a0a; }\n    .hero.is-white .tabs a {\n      color: #0a0a0a;\n      opacity: 0.9; }\n      .hero.is-white .tabs a:hover {\n        opacity: 1; }\n    .hero.is-white .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-white .tabs.is-boxed a, .hero.is-white .tabs.is-toggle a {\n      color: #0a0a0a; }\n      .hero.is-white .tabs.is-boxed a:hover, .hero.is-white .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-white .tabs.is-boxed li.is-active a, .hero.is-white .tabs.is-boxed li.is-active a:hover, .hero.is-white .tabs.is-toggle li.is-active a, .hero.is-white .tabs.is-toggle li.is-active a:hover {\n      background-color: #0a0a0a;\n      border-color: #0a0a0a;\n      color: white; }\n    .hero.is-white.is-bold {\n      background-image: linear-gradient(141deg, #e6e6e6 0%, white 71%, white 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-white.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #e6e6e6 0%, white 71%, white 100%); } }\n  .hero.is-black {\n    background-color: #0a0a0a;\n    color: white; }\n    .hero.is-black a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-black strong {\n      color: inherit; }\n    .hero.is-black .title {\n      color: white; }\n    .hero.is-black .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-black .subtitle a:not(.button),\n      .hero.is-black .subtitle strong {\n        color: white; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-black .navbar-menu {\n        background-color: #0a0a0a; } }\n    .hero.is-black .navbar-item,\n    .hero.is-black .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-black a.navbar-item:hover, .hero.is-black a.navbar-item.is-active,\n    .hero.is-black .navbar-link:hover,\n    .hero.is-black .navbar-link.is-active {\n      background-color: black;\n      color: white; }\n    .hero.is-black .tabs a {\n      color: white;\n      opacity: 0.9; }\n      .hero.is-black .tabs a:hover {\n        opacity: 1; }\n    .hero.is-black .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-black .tabs.is-boxed a, .hero.is-black .tabs.is-toggle a {\n      color: white; }\n      .hero.is-black .tabs.is-boxed a:hover, .hero.is-black .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-black .tabs.is-boxed li.is-active a, .hero.is-black .tabs.is-boxed li.is-active a:hover, .hero.is-black .tabs.is-toggle li.is-active a, .hero.is-black .tabs.is-toggle li.is-active a:hover {\n      background-color: white;\n      border-color: white;\n      color: #0a0a0a; }\n    .hero.is-black.is-bold {\n      background-image: linear-gradient(141deg, black 0%, #0a0a0a 71%, #181616 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-black.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, black 0%, #0a0a0a 71%, #181616 100%); } }\n  .hero.is-light {\n    background-color: whitesmoke;\n    color: rgba(0, 0, 0, 0.7); }\n    .hero.is-light a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-light strong {\n      color: inherit; }\n    .hero.is-light .title {\n      color: rgba(0, 0, 0, 0.7); }\n    .hero.is-light .subtitle {\n      color: rgba(0, 0, 0, 0.9); }\n      .hero.is-light .subtitle a:not(.button),\n      .hero.is-light .subtitle strong {\n        color: rgba(0, 0, 0, 0.7); }\n    @media screen and (max-width: 1023px) {\n      .hero.is-light .navbar-menu {\n        background-color: whitesmoke; } }\n    .hero.is-light .navbar-item,\n    .hero.is-light .navbar-link {\n      color: rgba(0, 0, 0, 0.7); }\n    .hero.is-light a.navbar-item:hover, .hero.is-light a.navbar-item.is-active,\n    .hero.is-light .navbar-link:hover,\n    .hero.is-light .navbar-link.is-active {\n      background-color: #e8e8e8;\n      color: rgba(0, 0, 0, 0.7); }\n    .hero.is-light .tabs a {\n      color: rgba(0, 0, 0, 0.7);\n      opacity: 0.9; }\n      .hero.is-light .tabs a:hover {\n        opacity: 1; }\n    .hero.is-light .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-light .tabs.is-boxed a, .hero.is-light .tabs.is-toggle a {\n      color: rgba(0, 0, 0, 0.7); }\n      .hero.is-light .tabs.is-boxed a:hover, .hero.is-light .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-light .tabs.is-boxed li.is-active a, .hero.is-light .tabs.is-boxed li.is-active a:hover, .hero.is-light .tabs.is-toggle li.is-active a, .hero.is-light .tabs.is-toggle li.is-active a:hover {\n      background-color: rgba(0, 0, 0, 0.7);\n      border-color: rgba(0, 0, 0, 0.7);\n      color: whitesmoke; }\n    .hero.is-light.is-bold {\n      background-image: linear-gradient(141deg, #dfd8d9 0%, whitesmoke 71%, white 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-light.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #dfd8d9 0%, whitesmoke 71%, white 100%); } }\n  .hero.is-dark {\n    background-color: #353A48;\n    color: #fff; }\n    .hero.is-dark a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-dark strong {\n      color: inherit; }\n    .hero.is-dark .title {\n      color: #fff; }\n    .hero.is-dark .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-dark .subtitle a:not(.button),\n      .hero.is-dark .subtitle strong {\n        color: #fff; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-dark .navbar-menu {\n        background-color: #353A48; } }\n    .hero.is-dark .navbar-item,\n    .hero.is-dark .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-dark a.navbar-item:hover, .hero.is-dark a.navbar-item.is-active,\n    .hero.is-dark .navbar-link:hover,\n    .hero.is-dark .navbar-link.is-active {\n      background-color: #2a2e39;\n      color: #fff; }\n    .hero.is-dark .tabs a {\n      color: #fff;\n      opacity: 0.9; }\n      .hero.is-dark .tabs a:hover {\n        opacity: 1; }\n    .hero.is-dark .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-dark .tabs.is-boxed a, .hero.is-dark .tabs.is-toggle a {\n      color: #fff; }\n      .hero.is-dark .tabs.is-boxed a:hover, .hero.is-dark .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-dark .tabs.is-boxed li.is-active a, .hero.is-dark .tabs.is-boxed li.is-active a:hover, .hero.is-dark .tabs.is-toggle li.is-active a, .hero.is-dark .tabs.is-toggle li.is-active a:hover {\n      background-color: #fff;\n      border-color: #fff;\n      color: #353A48; }\n    .hero.is-dark.is-bold {\n      background-image: linear-gradient(141deg, #1c242e 0%, #353A48 71%, #3c3f5a 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-dark.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #1c242e 0%, #353A48 71%, #3c3f5a 100%); } }\n  .hero.is-primary {\n    background-color: #74BE43;\n    color: #fff; }\n    .hero.is-primary a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-primary strong {\n      color: inherit; }\n    .hero.is-primary .title {\n      color: #fff; }\n    .hero.is-primary .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-primary .subtitle a:not(.button),\n      .hero.is-primary .subtitle strong {\n        color: #fff; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-primary .navbar-menu {\n        background-color: #74BE43; } }\n    .hero.is-primary .navbar-item,\n    .hero.is-primary .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-primary a.navbar-item:hover, .hero.is-primary a.navbar-item.is-active,\n    .hero.is-primary .navbar-link:hover,\n    .hero.is-primary .navbar-link.is-active {\n      background-color: #68ac3b;\n      color: #fff; }\n    .hero.is-primary .tabs a {\n      color: #fff;\n      opacity: 0.9; }\n      .hero.is-primary .tabs a:hover {\n        opacity: 1; }\n    .hero.is-primary .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-primary .tabs.is-boxed a, .hero.is-primary .tabs.is-toggle a {\n      color: #fff; }\n      .hero.is-primary .tabs.is-boxed a:hover, .hero.is-primary .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-primary .tabs.is-boxed li.is-active a, .hero.is-primary .tabs.is-boxed li.is-active a:hover, .hero.is-primary .tabs.is-toggle li.is-active a, .hero.is-primary .tabs.is-toggle li.is-active a:hover {\n      background-color: #fff;\n      border-color: #fff;\n      color: #74BE43; }\n    .hero.is-primary.is-bold {\n      background-image: linear-gradient(141deg, #6fa32b 0%, #74BE43 71%, #6dca50 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-primary.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #6fa32b 0%, #74BE43 71%, #6dca50 100%); } }\n  .hero.is-link {\n    background-color: #3273dc;\n    color: #fff; }\n    .hero.is-link a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-link strong {\n      color: inherit; }\n    .hero.is-link .title {\n      color: #fff; }\n    .hero.is-link .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-link .subtitle a:not(.button),\n      .hero.is-link .subtitle strong {\n        color: #fff; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-link .navbar-menu {\n        background-color: #3273dc; } }\n    .hero.is-link .navbar-item,\n    .hero.is-link .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-link a.navbar-item:hover, .hero.is-link a.navbar-item.is-active,\n    .hero.is-link .navbar-link:hover,\n    .hero.is-link .navbar-link.is-active {\n      background-color: #2366d1;\n      color: #fff; }\n    .hero.is-link .tabs a {\n      color: #fff;\n      opacity: 0.9; }\n      .hero.is-link .tabs a:hover {\n        opacity: 1; }\n    .hero.is-link .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-link .tabs.is-boxed a, .hero.is-link .tabs.is-toggle a {\n      color: #fff; }\n      .hero.is-link .tabs.is-boxed a:hover, .hero.is-link .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-link .tabs.is-boxed li.is-active a, .hero.is-link .tabs.is-boxed li.is-active a:hover, .hero.is-link .tabs.is-toggle li.is-active a, .hero.is-link .tabs.is-toggle li.is-active a:hover {\n      background-color: #fff;\n      border-color: #fff;\n      color: #3273dc; }\n    .hero.is-link.is-bold {\n      background-image: linear-gradient(141deg, #1577c6 0%, #3273dc 71%, #4366e5 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-link.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #1577c6 0%, #3273dc 71%, #4366e5 100%); } }\n  .hero.is-info {\n    background-color: #3298dc;\n    color: #fff; }\n    .hero.is-info a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-info strong {\n      color: inherit; }\n    .hero.is-info .title {\n      color: #fff; }\n    .hero.is-info .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-info .subtitle a:not(.button),\n      .hero.is-info .subtitle strong {\n        color: #fff; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-info .navbar-menu {\n        background-color: #3298dc; } }\n    .hero.is-info .navbar-item,\n    .hero.is-info .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-info a.navbar-item:hover, .hero.is-info a.navbar-item.is-active,\n    .hero.is-info .navbar-link:hover,\n    .hero.is-info .navbar-link.is-active {\n      background-color: #238cd1;\n      color: #fff; }\n    .hero.is-info .tabs a {\n      color: #fff;\n      opacity: 0.9; }\n      .hero.is-info .tabs a:hover {\n        opacity: 1; }\n    .hero.is-info .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-info .tabs.is-boxed a, .hero.is-info .tabs.is-toggle a {\n      color: #fff; }\n      .hero.is-info .tabs.is-boxed a:hover, .hero.is-info .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-info .tabs.is-boxed li.is-active a, .hero.is-info .tabs.is-boxed li.is-active a:hover, .hero.is-info .tabs.is-toggle li.is-active a, .hero.is-info .tabs.is-toggle li.is-active a:hover {\n      background-color: #fff;\n      border-color: #fff;\n      color: #3298dc; }\n    .hero.is-info.is-bold {\n      background-image: linear-gradient(141deg, #159dc6 0%, #3298dc 71%, #4389e5 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-info.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #159dc6 0%, #3298dc 71%, #4389e5 100%); } }\n  .hero.is-success {\n    background-color: #74BE43;\n    color: #fff; }\n    .hero.is-success a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-success strong {\n      color: inherit; }\n    .hero.is-success .title {\n      color: #fff; }\n    .hero.is-success .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-success .subtitle a:not(.button),\n      .hero.is-success .subtitle strong {\n        color: #fff; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-success .navbar-menu {\n        background-color: #74BE43; } }\n    .hero.is-success .navbar-item,\n    .hero.is-success .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-success a.navbar-item:hover, .hero.is-success a.navbar-item.is-active,\n    .hero.is-success .navbar-link:hover,\n    .hero.is-success .navbar-link.is-active {\n      background-color: #68ac3b;\n      color: #fff; }\n    .hero.is-success .tabs a {\n      color: #fff;\n      opacity: 0.9; }\n      .hero.is-success .tabs a:hover {\n        opacity: 1; }\n    .hero.is-success .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-success .tabs.is-boxed a, .hero.is-success .tabs.is-toggle a {\n      color: #fff; }\n      .hero.is-success .tabs.is-boxed a:hover, .hero.is-success .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-success .tabs.is-boxed li.is-active a, .hero.is-success .tabs.is-boxed li.is-active a:hover, .hero.is-success .tabs.is-toggle li.is-active a, .hero.is-success .tabs.is-toggle li.is-active a:hover {\n      background-color: #fff;\n      border-color: #fff;\n      color: #74BE43; }\n    .hero.is-success.is-bold {\n      background-image: linear-gradient(141deg, #6fa32b 0%, #74BE43 71%, #6dca50 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-success.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #6fa32b 0%, #74BE43 71%, #6dca50 100%); } }\n  .hero.is-warning {\n    background-color: #ffdd57;\n    color: rgba(0, 0, 0, 0.7); }\n    .hero.is-warning a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-warning strong {\n      color: inherit; }\n    .hero.is-warning .title {\n      color: rgba(0, 0, 0, 0.7); }\n    .hero.is-warning .subtitle {\n      color: rgba(0, 0, 0, 0.9); }\n      .hero.is-warning .subtitle a:not(.button),\n      .hero.is-warning .subtitle strong {\n        color: rgba(0, 0, 0, 0.7); }\n    @media screen and (max-width: 1023px) {\n      .hero.is-warning .navbar-menu {\n        background-color: #ffdd57; } }\n    .hero.is-warning .navbar-item,\n    .hero.is-warning .navbar-link {\n      color: rgba(0, 0, 0, 0.7); }\n    .hero.is-warning a.navbar-item:hover, .hero.is-warning a.navbar-item.is-active,\n    .hero.is-warning .navbar-link:hover,\n    .hero.is-warning .navbar-link.is-active {\n      background-color: #ffd83d;\n      color: rgba(0, 0, 0, 0.7); }\n    .hero.is-warning .tabs a {\n      color: rgba(0, 0, 0, 0.7);\n      opacity: 0.9; }\n      .hero.is-warning .tabs a:hover {\n        opacity: 1; }\n    .hero.is-warning .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-warning .tabs.is-boxed a, .hero.is-warning .tabs.is-toggle a {\n      color: rgba(0, 0, 0, 0.7); }\n      .hero.is-warning .tabs.is-boxed a:hover, .hero.is-warning .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-warning .tabs.is-boxed li.is-active a, .hero.is-warning .tabs.is-boxed li.is-active a:hover, .hero.is-warning .tabs.is-toggle li.is-active a, .hero.is-warning .tabs.is-toggle li.is-active a:hover {\n      background-color: rgba(0, 0, 0, 0.7);\n      border-color: rgba(0, 0, 0, 0.7);\n      color: #ffdd57; }\n    .hero.is-warning.is-bold {\n      background-image: linear-gradient(141deg, #ffaf24 0%, #ffdd57 71%, #fffa70 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-warning.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #ffaf24 0%, #ffdd57 71%, #fffa70 100%); } }\n  .hero.is-danger {\n    background-color: #f14668;\n    color: #fff; }\n    .hero.is-danger a:not(.button):not(.dropdown-item):not(.tag):not(.pagination-link.is-current),\n    .hero.is-danger strong {\n      color: inherit; }\n    .hero.is-danger .title {\n      color: #fff; }\n    .hero.is-danger .subtitle {\n      color: rgba(255, 255, 255, 0.9); }\n      .hero.is-danger .subtitle a:not(.button),\n      .hero.is-danger .subtitle strong {\n        color: #fff; }\n    @media screen and (max-width: 1023px) {\n      .hero.is-danger .navbar-menu {\n        background-color: #f14668; } }\n    .hero.is-danger .navbar-item,\n    .hero.is-danger .navbar-link {\n      color: rgba(255, 255, 255, 0.7); }\n    .hero.is-danger a.navbar-item:hover, .hero.is-danger a.navbar-item.is-active,\n    .hero.is-danger .navbar-link:hover,\n    .hero.is-danger .navbar-link.is-active {\n      background-color: #ef2e55;\n      color: #fff; }\n    .hero.is-danger .tabs a {\n      color: #fff;\n      opacity: 0.9; }\n      .hero.is-danger .tabs a:hover {\n        opacity: 1; }\n    .hero.is-danger .tabs li.is-active a {\n      opacity: 1; }\n    .hero.is-danger .tabs.is-boxed a, .hero.is-danger .tabs.is-toggle a {\n      color: #fff; }\n      .hero.is-danger .tabs.is-boxed a:hover, .hero.is-danger .tabs.is-toggle a:hover {\n        background-color: rgba(10, 10, 10, 0.1); }\n    .hero.is-danger .tabs.is-boxed li.is-active a, .hero.is-danger .tabs.is-boxed li.is-active a:hover, .hero.is-danger .tabs.is-toggle li.is-active a, .hero.is-danger .tabs.is-toggle li.is-active a:hover {\n      background-color: #fff;\n      border-color: #fff;\n      color: #f14668; }\n    .hero.is-danger.is-bold {\n      background-image: linear-gradient(141deg, #fa0a62 0%, #f14668 71%, #f7595f 100%); }\n      @media screen and (max-width: 768px) {\n        .hero.is-danger.is-bold .navbar-menu {\n          background-image: linear-gradient(141deg, #fa0a62 0%, #f14668 71%, #f7595f 100%); } }\n  .hero.is-small .hero-body {\n    padding-bottom: 1.5rem;\n    padding-top: 1.5rem; }\n  @media screen and (min-width: 769px), print {\n    .hero.is-medium .hero-body {\n      padding-bottom: 9rem;\n      padding-top: 9rem; } }\n  @media screen and (min-width: 769px), print {\n    .hero.is-large .hero-body {\n      padding-bottom: 18rem;\n      padding-top: 18rem; } }\n  .hero.is-halfheight .hero-body, .hero.is-fullheight .hero-body, .hero.is-fullheight-with-navbar .hero-body {\n    align-items: center;\n    display: flex; }\n    .hero.is-halfheight .hero-body > .container, .hero.is-fullheight .hero-body > .container, .hero.is-fullheight-with-navbar .hero-body > .container {\n      flex-grow: 1;\n      flex-shrink: 1; }\n  .hero.is-halfheight {\n    min-height: 50vh; }\n  .hero.is-fullheight {\n    min-height: 100vh; }\n\n.hero-video {\n  overflow: hidden; }\n  .hero-video video {\n    left: 50%;\n    min-height: 100%;\n    min-width: 100%;\n    position: absolute;\n    top: 50%;\n    transform: translate3d(-50%, -50%, 0); }\n  .hero-video.is-transparent {\n    opacity: 0.3; }\n  @media screen and (max-width: 768px) {\n    .hero-video {\n      display: none; } }\n\n.hero-buttons {\n  margin-top: 1.5rem; }\n  @media screen and (max-width: 768px) {\n    .hero-buttons .button {\n      display: flex; }\n      .hero-buttons .button:not(:last-child) {\n        margin-bottom: 0.75rem; } }\n  @media screen and (min-width: 769px), print {\n    .hero-buttons {\n      display: flex;\n      justify-content: center; }\n      .hero-buttons .button:not(:last-child) {\n        margin-right: 1.5rem; } }\n\n.hero-head,\n.hero-foot {\n  flex-grow: 0;\n  flex-shrink: 0; }\n\n.hero-body {\n  flex-grow: 1;\n  flex-shrink: 0;\n  padding: 3rem 1.5rem; }\n\n.section {\n  padding: 3rem 1.5rem; }\n  @media screen and (min-width: 1024px) {\n    .section.is-medium {\n      padding: 9rem 1.5rem; }\n    .section.is-large {\n      padding: 18rem 1.5rem; } }\n\n.footer {\n  background-color: #fafafa;\n  padding: 3rem 1.5rem 6rem; }\n";
    styleInject(css);

    /* src/components/Navbar.svelte generated by Svelte v3.18.1 */

    const file = "src/components/Navbar.svelte";

    function create_fragment(ctx) {
    	let nav;
    	let div0;
    	let a;
    	let img;
    	let img_src_value;
    	let t;
    	let div2;
    	let div1;

    	const block = {
    		c: function create() {
    			nav = element("nav");
    			div0 = element("div");
    			a = element("a");
    			img = element("img");
    			t = space();
    			div2 = element("div");
    			div1 = element("div");
    			if (img.src !== (img_src_value = "images/omg.webp")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "logo");
    			add_location(img, file, 3, 6, 161);
    			attr_dev(a, "class", "navbar-item");
    			attr_dev(a, "href", "http://ordermygear.com");
    			add_location(a, file, 2, 4, 101);
    			attr_dev(div0, "class", "navbar-brand");
    			add_location(div0, file, 1, 2, 70);
    			attr_dev(div1, "class", "navbar-item");
    			add_location(div1, file, 8, 4, 250);
    			attr_dev(div2, "class", "navbar-end");
    			add_location(div2, file, 7, 2, 221);
    			attr_dev(nav, "class", "navbar");
    			attr_dev(nav, "role", "navigation");
    			attr_dev(nav, "aria-label", "main navigation");
    			add_location(nav, file, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, nav, anchor);
    			append_dev(nav, div0);
    			append_dev(div0, a);
    			append_dev(a, img);
    			append_dev(nav, t);
    			append_dev(nav, div2);
    			append_dev(div2, div1);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(nav);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class Navbar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Navbar",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe,
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    const email = writable(null);
    const password = writable('');
    const firstName = writable('');
    const lastName = writable('');
    const loggedIn = writable(false);

    const registeredUsers = writable([
      {
        email: 'khalil@ordermygear.com',
        password: 'password',
        firstName: 'Khalil',
        lastName: 'Bouaazzi'
      }
    ]);

    const emailAlreadyExists = derived(email, 
      ($email, set) => {
        let users;
        registeredUsers.subscribe(value => {
          users = value;
        });
        set(null);
        if (!$email || $email === '') {
          console.log('there you go');
          set(null);
        }
        else set(!!users.find((user) => user.email === $email));
      }, null
    );

    const checkEmailStatus = derived([email, emailAlreadyExists], 
      ([$email, $emailAlreadyExists], set) => {
        if ($email === null) {
          set('');
        }
        if ($email && !$emailAlreadyExists) {
          set('looks good');
        }

        if ($emailAlreadyExists === true) {
          set('already exists');
        }
        if (!$email) {
          set('');
        }
      }
    );

    /* src/components/LoginForm.svelte generated by Svelte v3.18.1 */

    const file$1 = "src/components/LoginForm.svelte";

    // (40:6) {#if $emailAlreadyExists === false}
    function create_if_block_2(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "This email is available";
    			attr_dev(p, "class", "help is-success");
    			add_location(p, file$1, 40, 8, 965);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(40:6) {#if $emailAlreadyExists === false}",
    		ctx
    	});

    	return block;
    }

    // (43:6) {#if $emailAlreadyExists === true}
    function create_if_block_1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "This email has been registered before";
    			attr_dev(p, "class", "help is-danger");
    			add_location(p, file$1, 43, 8, 1081);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(43:6) {#if $emailAlreadyExists === true}",
    		ctx
    	});

    	return block;
    }

    // (70:4) {#if loading}
    function create_if_block(ctx) {
    	let progress;

    	const block = {
    		c: function create() {
    			progress = element("progress");
    			progress.textContent = "15%";
    			attr_dev(progress, "class", "progress is-small is-primary");
    			attr_dev(progress, "max", "100");
    			add_location(progress, file$1, 70, 6, 1978);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, progress, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(progress);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(70:4) {#if loading}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div10;
    	let div9;
    	let h1;
    	let t1;
    	let div1;
    	let label0;
    	let t3;
    	let div0;
    	let input0;
    	let t4;
    	let t5;
    	let t6;
    	let div3;
    	let label1;
    	let t8;
    	let div2;
    	let input1;
    	let t9;
    	let div5;
    	let label2;
    	let t11;
    	let div4;
    	let input2;
    	let t12;
    	let div7;
    	let label3;
    	let t14;
    	let div6;
    	let input3;
    	let t15;
    	let div8;
    	let button;
    	let strong;
    	let t17;
    	let dispose;
    	let if_block0 = /*$emailAlreadyExists*/ ctx[5] === false && create_if_block_2(ctx);
    	let if_block1 = /*$emailAlreadyExists*/ ctx[5] === true && create_if_block_1(ctx);
    	let if_block2 = /*loading*/ ctx[0] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div10 = element("div");
    			div9 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Sign Up";
    			t1 = space();
    			div1 = element("div");
    			label0 = element("label");
    			label0.textContent = "Email Address";
    			t3 = space();
    			div0 = element("div");
    			input0 = element("input");
    			t4 = space();
    			if (if_block0) if_block0.c();
    			t5 = space();
    			if (if_block1) if_block1.c();
    			t6 = space();
    			div3 = element("div");
    			label1 = element("label");
    			label1.textContent = "Password";
    			t8 = space();
    			div2 = element("div");
    			input1 = element("input");
    			t9 = space();
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "First Name";
    			t11 = space();
    			div4 = element("div");
    			input2 = element("input");
    			t12 = space();
    			div7 = element("div");
    			label3 = element("label");
    			label3.textContent = "Last Name";
    			t14 = space();
    			div6 = element("div");
    			input3 = element("input");
    			t15 = space();
    			div8 = element("div");
    			button = element("button");
    			strong = element("strong");
    			strong.textContent = "Sign up";
    			t17 = space();
    			if (if_block2) if_block2.c();
    			attr_dev(h1, "class", "title is-1");
    			add_location(h1, file$1, 33, 4, 676);
    			attr_dev(label0, "class", "label");
    			add_location(label0, file$1, 35, 6, 742);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "input");
    			attr_dev(input0, "placeholder", "blah@omg.com");
    			add_location(input0, file$1, 37, 8, 821);
    			attr_dev(div0, "class", "control");
    			add_location(div0, file$1, 36, 6, 791);
    			attr_dev(div1, "class", "field");
    			add_location(div1, file$1, 34, 4, 716);
    			attr_dev(label1, "class", "label");
    			add_location(label1, file$1, 47, 6, 1202);
    			attr_dev(input1, "type", "password");
    			attr_dev(input1, "class", "input");
    			attr_dev(input1, "placeholder", "no peeking, jerk");
    			add_location(input1, file$1, 49, 8, 1276);
    			attr_dev(div2, "class", "control");
    			add_location(div2, file$1, 48, 6, 1246);
    			attr_dev(div3, "class", "field");
    			add_location(div3, file$1, 46, 4, 1176);
    			attr_dev(label2, "class", "label");
    			add_location(label2, file$1, 53, 6, 1422);
    			attr_dev(input2, "type", "text");
    			attr_dev(input2, "class", "input");
    			attr_dev(input2, "placeholder", "John");
    			add_location(input2, file$1, 55, 8, 1498);
    			attr_dev(div4, "class", "control");
    			add_location(div4, file$1, 54, 6, 1468);
    			attr_dev(div5, "class", "field");
    			add_location(div5, file$1, 52, 4, 1396);
    			attr_dev(label3, "class", "label");
    			add_location(label3, file$1, 59, 6, 1629);
    			attr_dev(input3, "type", "text");
    			attr_dev(input3, "class", "input");
    			attr_dev(input3, "placeholder", "Doe");
    			add_location(input3, file$1, 61, 8, 1704);
    			attr_dev(div6, "class", "control");
    			add_location(div6, file$1, 60, 6, 1674);
    			attr_dev(div7, "class", "field");
    			add_location(div7, file$1, 58, 4, 1603);
    			add_location(strong, file$1, 66, 8, 1902);
    			attr_dev(button, "class", "button is-primary");
    			add_location(button, file$1, 65, 6, 1835);
    			attr_dev(div8, "class", "buttons");
    			add_location(div8, file$1, 64, 4, 1807);
    			attr_dev(div9, "class", "box");
    			add_location(div9, file$1, 32, 2, 654);
    			attr_dev(div10, "class", "loginContainer svelte-1fzo5n6");
    			add_location(div10, file$1, 31, 0, 623);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div10, anchor);
    			append_dev(div10, div9);
    			append_dev(div9, h1);
    			append_dev(div9, t1);
    			append_dev(div9, div1);
    			append_dev(div1, label0);
    			append_dev(div1, t3);
    			append_dev(div1, div0);
    			append_dev(div0, input0);
    			set_input_value(input0, /*$email*/ ctx[1]);
    			append_dev(div1, t4);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div1, t5);
    			if (if_block1) if_block1.m(div1, null);
    			append_dev(div9, t6);
    			append_dev(div9, div3);
    			append_dev(div3, label1);
    			append_dev(div3, t8);
    			append_dev(div3, div2);
    			append_dev(div2, input1);
    			set_input_value(input1, /*$password*/ ctx[2]);
    			append_dev(div9, t9);
    			append_dev(div9, div5);
    			append_dev(div5, label2);
    			append_dev(div5, t11);
    			append_dev(div5, div4);
    			append_dev(div4, input2);
    			set_input_value(input2, /*$firstName*/ ctx[3]);
    			append_dev(div9, t12);
    			append_dev(div9, div7);
    			append_dev(div7, label3);
    			append_dev(div7, t14);
    			append_dev(div7, div6);
    			append_dev(div6, input3);
    			set_input_value(input3, /*$lastName*/ ctx[4]);
    			append_dev(div9, t15);
    			append_dev(div9, div8);
    			append_dev(div8, button);
    			append_dev(button, strong);
    			append_dev(div9, t17);
    			if (if_block2) if_block2.m(div9, null);

    			dispose = [
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[9]),
    				listen_dev(input1, "input", /*input1_input_handler*/ ctx[10]),
    				listen_dev(input2, "input", /*input2_input_handler*/ ctx[11]),
    				listen_dev(input3, "input", /*input3_input_handler*/ ctx[12]),
    				listen_dev(button, "click", /*handleSubmit*/ ctx[6], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$email*/ 2 && input0.value !== /*$email*/ ctx[1]) {
    				set_input_value(input0, /*$email*/ ctx[1]);
    			}

    			if (/*$emailAlreadyExists*/ ctx[5] === false) {
    				if (!if_block0) {
    					if_block0 = create_if_block_2(ctx);
    					if_block0.c();
    					if_block0.m(div1, t5);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*$emailAlreadyExists*/ ctx[5] === true) {
    				if (!if_block1) {
    					if_block1 = create_if_block_1(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*$password*/ 4 && input1.value !== /*$password*/ ctx[2]) {
    				set_input_value(input1, /*$password*/ ctx[2]);
    			}

    			if (dirty & /*$firstName*/ 8 && input2.value !== /*$firstName*/ ctx[3]) {
    				set_input_value(input2, /*$firstName*/ ctx[3]);
    			}

    			if (dirty & /*$lastName*/ 16 && input3.value !== /*$lastName*/ ctx[4]) {
    				set_input_value(input3, /*$lastName*/ ctx[4]);
    			}

    			if (/*loading*/ ctx[0]) {
    				if (!if_block2) {
    					if_block2 = create_if_block(ctx);
    					if_block2.c();
    					if_block2.m(div9, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div10);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $email;
    	let $password;
    	let $firstName;
    	let $lastName;
    	let $loggedIn;
    	let $registeredUsers;
    	let $emailAlreadyExists;
    	validate_store(email, "email");
    	component_subscribe($$self, email, $$value => $$invalidate(1, $email = $$value));
    	validate_store(password, "password");
    	component_subscribe($$self, password, $$value => $$invalidate(2, $password = $$value));
    	validate_store(firstName, "firstName");
    	component_subscribe($$self, firstName, $$value => $$invalidate(3, $firstName = $$value));
    	validate_store(lastName, "lastName");
    	component_subscribe($$self, lastName, $$value => $$invalidate(4, $lastName = $$value));
    	validate_store(loggedIn, "loggedIn");
    	component_subscribe($$self, loggedIn, $$value => $$invalidate(7, $loggedIn = $$value));
    	validate_store(registeredUsers, "registeredUsers");
    	component_subscribe($$self, registeredUsers, $$value => $$invalidate(8, $registeredUsers = $$value));
    	validate_store(emailAlreadyExists, "emailAlreadyExists");
    	component_subscribe($$self, emailAlreadyExists, $$value => $$invalidate(5, $emailAlreadyExists = $$value));
    	let loading = false;

    	const handleSubmit = () => {
    		$$invalidate(0, loading = true);

    		setTimeout(
    			() => {
    				if ($email && $password && $firstName && $lastName && !emailAlreadyExists) {
    					set_store_value(loggedIn, $loggedIn = true);

    					$registeredUsers.push({
    						email: $email,
    						password: $password,
    						firstName: $firstName,
    						lastName: $lastName
    					});

    					$$invalidate(0, loading = false);
    				}
    			},
    			2000
    		);
    	};

    	function input0_input_handler() {
    		$email = this.value;
    		email.set($email);
    	}

    	function input1_input_handler() {
    		$password = this.value;
    		password.set($password);
    	}

    	function input2_input_handler() {
    		$firstName = this.value;
    		firstName.set($firstName);
    	}

    	function input3_input_handler() {
    		$lastName = this.value;
    		lastName.set($lastName);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("loading" in $$props) $$invalidate(0, loading = $$props.loading);
    		if ("$email" in $$props) email.set($email = $$props.$email);
    		if ("$password" in $$props) password.set($password = $$props.$password);
    		if ("$firstName" in $$props) firstName.set($firstName = $$props.$firstName);
    		if ("$lastName" in $$props) lastName.set($lastName = $$props.$lastName);
    		if ("$loggedIn" in $$props) loggedIn.set($loggedIn = $$props.$loggedIn);
    		if ("$registeredUsers" in $$props) registeredUsers.set($registeredUsers = $$props.$registeredUsers);
    		if ("$emailAlreadyExists" in $$props) emailAlreadyExists.set($emailAlreadyExists = $$props.$emailAlreadyExists);
    	};

    	return [
    		loading,
    		$email,
    		$password,
    		$firstName,
    		$lastName,
    		$emailAlreadyExists,
    		handleSubmit,
    		$loggedIn,
    		$registeredUsers,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		input3_input_handler
    	];
    }

    class LoginForm extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "LoginForm",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/components/Welcome.svelte generated by Svelte v3.18.1 */

    const file$2 = "src/components/Welcome.svelte";

    function create_fragment$2(ctx) {
    	let section;
    	let div1;
    	let div0;
    	let h1;
    	let t1;
    	let h2;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Welcome! Thanks, Svelte!";
    			t1 = space();
    			h2 = element("h2");
    			h2.textContent = "Special thanks to bulma";
    			attr_dev(h1, "class", "title");
    			add_location(h1, file$2, 3, 6, 102);
    			attr_dev(h2, "class", "subtitle");
    			add_location(h2, file$2, 6, 6, 172);
    			attr_dev(div0, "class", "container");
    			add_location(div0, file$2, 2, 4, 72);
    			attr_dev(div1, "class", "hero-body");
    			add_location(div1, file$2, 1, 2, 44);
    			attr_dev(section, "class", "hero is-primary is-bold svelte-1vpsix");
    			add_location(section, file$2, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div1);
    			append_dev(div1, div0);
    			append_dev(div0, h1);
    			append_dev(div0, t1);
    			append_dev(div0, h2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class Welcome extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Welcome",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.18.1 */
    const file$3 = "src/App.svelte";

    // (16:1) {:else}
    function create_else_block(ctx) {
    	let div;
    	let div_outro;
    	let current;
    	const loginform = new LoginForm({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(loginform.$$.fragment);
    			add_location(div, file$3, 16, 1, 429);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(loginform, div, null);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(loginform.$$.fragment, local);
    			if (div_outro) div_outro.end(1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(loginform.$$.fragment, local);
    			div_outro = create_out_transition(div, fade, {});
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(loginform);
    			if (detaching && div_outro) div_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(16:1) {:else}",
    		ctx
    	});

    	return block;
    }

    // (12:1) {#if $loggedIn}
    function create_if_block$1(ctx) {
    	let div;
    	let div_intro;
    	let current;
    	const welcome = new Welcome({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(welcome.$$.fragment);
    			add_location(div, file$3, 12, 1, 353);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(welcome, div, null);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(welcome.$$.fragment, local);

    			if (!div_intro) {
    				add_render_callback(() => {
    					div_intro = create_in_transition(div, fly, { y: 1000, duration: 2000 });
    					div_intro.start();
    				});
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(welcome.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(welcome);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(12:1) {#if $loggedIn}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let t;
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const navbar = new Navbar({ $$inline: true });
    	const if_block_creators = [create_if_block$1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$loggedIn*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			create_component(navbar.$$.fragment);
    			t = space();
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "class", "container svelte-1r2lg2r");
    			add_location(div, file$3, 10, 0, 311);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(navbar, target, anchor);
    			insert_dev(target, t, anchor);
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(navbar.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(navbar.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(navbar, detaching);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $loggedIn;
    	validate_store(loggedIn, "loggedIn");
    	component_subscribe($$self, loggedIn, $$value => $$invalidate(0, $loggedIn = $$value));

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("$loggedIn" in $$props) loggedIn.set($loggedIn = $$props.$loggedIn);
    	};

    	return [$loggedIn];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
