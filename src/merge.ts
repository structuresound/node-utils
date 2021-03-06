import { Merge } from './types';

import { check } from './check';

import { arrayify, Mutate, contains } from './arrays';
import { conditionalUnflatten } from './keypath';

const { concat, subtract, difference, intersect, union, xor, assign, compareAndFilter } = Mutate;
function _mergeArray(lhs: any[], rhs: any[], operator: Merge.Operator) {
    switch (operator) {
        case '=': assign(lhs, rhs); break;
        case '+': concat(lhs, rhs); break;
        case '-': subtract(lhs, rhs); break;
        case '!': difference(lhs, rhs); break;
        case '&': intersect(lhs, rhs); break;
        case '|': union(lhs, rhs); break;
        case '^': xor(lhs, rhs); break;
        case '?': compareAndFilter(lhs, rhs, (a, b) => a && b); break;
        case '*': compareAndFilter(lhs, rhs, (a, b) => b && a); break;
        default: throw new Error(`unhandled Array merge operator ${operator} lhs: ${lhs}`);
    }
}

export function mergeLhsArray({ data: lhs, state }: Merge.ReturnValue, rhs: any): Merge.ReturnValue {
    const { merge: { operator } } = state;
    if (check(rhs, Object)) {
        let mutated;
        const setter = conditionalUnflatten(rhs);
        for (const key of Object.keys(setter)) {
            if ((key.length === 2) && (key[0] === '<')) {
                const nextState = {
                    ...state,
                    merge: {
                        operator: <Merge.Operator>key[1]
                    }
                }
                mutated = true;
                mergeLhsArray({ data: lhs, state: nextState }, setter[key]).data;
            }
        }
        if (mutated) {
            return { data: undefined, state };
        }
    }
    else if (check(rhs, Array)) {
        recurArray({ data: null, state }, rhs)
        _mergeArray(<any[]>lhs, <any[]>rhs, operator);
        return { data: undefined, state };
    }
    switch (operator) {
        case '=': throw new Error('replacing array value with non-array value');
        default:
            _mergeArray(<any[]>lhs, arrayify(rhs), operator)
            return { data: undefined, state };
    }
}

const doMerge = (lhs, operator, rhs, data, key, state) => {

    const assignment = mergeOrReturnAssignment({ data: lhs, state }, rhs).data;
    if (assignment !== undefined) { // we skip undefined becuase prev mergeOrReturnAssignment "pruned it"
        if (operator == '^') {
            if (data[key] === assignment) delete data[key]
            else data[key] = assignment
        } else {
            data[key] = assignment
        }
        // console.log('assigned:', assignment, 'next data:', data)
    }
    // else {
    //     console.log("didn't merge", data[key], "because", assignment, "<=", rhs)
    // }
}

export function mergeLhsObject(rv: Merge.ReturnValue, _setter: any): Merge.ReturnValue {
    const { state, data } = rv;
    const { merge: { operator } } = state;

    const setter = conditionalUnflatten(_setter);
    for (const key of Object.keys(setter)) {
        if ((key.length === 2) && (key[0] === '<')) {
            const nextState = {
                ...state,
                merge: {
                    operator: key[1]
                }
            }
            const assignment = mergeOrReturnAssignment({ data, state: nextState }, setter[key]).data;
            if (assignment !== undefined) {
                data[key] = assignment
            }
        } else {
            const lhsValue = data[key];
            const rhs = setter[key];
            switch (operator) {
                case '^': case '|': case '+': doMerge(lhsValue, operator, rhs, data, key, state); break;
                case '=': doMerge(lhsValue, operator, rhs, data, key, state); break;
                case '!': if (lhsValue === undefined) doMerge(lhsValue, operator, rhs, data, key, state); break;
                case '?': case '&': case '*': if (lhsValue) doMerge(lhsValue, operator, rhs, data, key, state); break;
                case '-': if (rhs !== undefined) delete data[key]; break;
                default: throw new Error(`unhandled merge operator ${operator}`)
            }

            if (check(data, Object)) {
                // rhs to lhs, clear not preset for assignment or mult.
                for (const key of Object.keys(data)) {
                    const negRhs = setter[key];
                    switch (operator) {
                        case '=': if (negRhs === undefined) delete data[key]; break;
                        case '&': case '*': if (!negRhs) delete data[key]; break;
                        default: break;
                    }
                }
            }
        }
    }
    return { data, state };
}

const printType = (val: any) => {
    if (check(val, Object)) {
        return 'object';
    }
    return val;
}

function throwIfImplicitConversion(rv: Merge.ReturnValue, rhs: any): any {
    const { data: lhs, state } = rv;
    const { operator } = state.merge;
    if ((lhs !== undefined) && (typeof lhs !== typeof rhs) && state.implicitTypeConversionError) {
        throw new Error(`implicit type change in ${printType(lhs)} ${operator} ${printType(rhs)}\n${JSON.stringify(rhs, null, 2)}`);
    }
}

export const recurArray = (rv: Merge.ReturnValue, rhs: any): void => {
    const { state } = rv;
    rhs.forEach((val: any, index: number) => {
        const res = mergeOrReturnAssignment({ data: undefined, state: { ...state, merge: { operator: '=' } } }, val).data
        if (res !== undefined) {
            rhs[index] = res;
        }
    });
}

export function mergeOrReturnAssignment(rv: Merge.ReturnValue, rhs: any): any {
    const { data: lhs, state } = rv;
    const { operator } = state.merge;
    if (check(lhs, Array)) {
        mergeLhsArray(rv, rhs);
    } else if (check(lhs, Object)) {
        // console.log(mergeOrReturnAssignment, rhs);
        if (check(rhs, Object)) {
            mergeLhsObject(rv, rhs);
        }
        else {
            if (contains(['&', '*', '-'], operator)) {
                switch (operator) {
                    case '*': case '&': if (rhs == null) return { data: undefined, state };
                    case '-': if (rhs) delete lhs[rhs]; return { data: undefined, state };
                }
            }
            return { data: rhs, state };
            // throwIfImplicitConversion(rv, rhs);
        }
    } else {
        if (check(rhs, Object)) {
            if (isMergeConstructor(rhs)) {
                const obj = construct(rv, rhs).data;
                return mergeOrReturnAssignment(rv, obj)
            }
            else {
                throwIfImplicitConversion(rv, rhs);
                let ret = { data: {}, state: { ...state, merge: { operator: '=' } } };
                mergeOrReturnAssignment(ret, rhs);
                return ret;
            }
        }
        else if (check(rhs, Array)) {
            throwIfImplicitConversion(rv, rhs);
            recurArray(rv, rhs);
        }
        return { data: rhs, state };
    }
    return { data: undefined, state };
}

export const isMergeConstructor = (val: any) => {
    for (const key of Object.keys(val)) {
        if ((key.length == 2) && (key[0] == '<')) {
            return true;
        }
    }
}

export function construct(rv: Merge.ReturnValue, constructor: any): Merge.ReturnValue {
    let data;
    const { state } = rv;
    for (const key of Object.keys(constructor)) {
        if ((key.length == 2) && (key[0] == '<')) {
            const nextOperator = <any>key[1];
            const res: any = mergeOrReturnAssignment({
                data, state: {
                    merge: {
                        ...state.merge,
                        operator: nextOperator
                    }
                }
            }, constructor[key]).data;
            if (res || check(res, Number)) {
                data = res;
            }
        }
    }
    return { data, state };
}


export function merge<T>(target: any, setter: any, state?: Merge.State) {
    const res = mergeOrReturnAssignment({
        data: target, state: {
            merge: {
                operator: '|'
            },
            ...state
        }
    }, setter).data;
    if (res || check(res, Number)) {
        return res;
    }
    return target;
}

export function mergeN<T>(target: T & { [index: string]: any }, ...args: any[]): T {
    for (const dict of args) {
        if (check(dict, Object)) {
            merge(target, dict);
        }
    }
    return target;
}

export { Merge }
