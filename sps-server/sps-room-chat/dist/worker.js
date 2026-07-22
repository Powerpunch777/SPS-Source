var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../external/sps-core/packages/plugins/sdk/dist/define-plugin.js
function definePlugin(definition) {
  return Object.freeze({ definition });
}

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path3, errorMaps, issueData } = params;
  const fullPath = [...path3, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../external/sps-core/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path3, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path3;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// ../../external/sps-core/packages/shared/src/constants.ts
var COMPANY_STATUSES = ["active", "paused", "archived"];
var DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
var MAX_COMPANY_ATTACHMENT_MAX_BYTES = 1024 * 1024 * 1024;
var DEPLOYMENT_MODES = ["local_trusted", "authenticated"];
var DEPLOYMENT_EXPOSURES = ["private", "public"];
var BIND_MODES = ["loopback", "lan", "tailnet", "custom"];
var AUTH_BASE_URL_MODES = ["auto", "explicit"];
var AGENT_STATUSES = [
  "active",
  "paused",
  "idle",
  "running",
  "error",
  "pending_approval",
  "terminated"
];
var AGENT_ADAPTER_TYPES = [
  "process",
  "http",
  "claude_local",
  "codex_local",
  "cursor_cloud",
  "gemini_local",
  "grok_local",
  "hermes_gateway",
  "hermes_local",
  "opencode_local",
  "pi_local",
  "cursor",
  "openclaw_gateway"
];
var AGENT_ROLES = [
  "ceo",
  "cto",
  "cmo",
  "cfo",
  "security",
  "engineer",
  "designer",
  "pm",
  "qa",
  "devops",
  "researcher",
  "general"
];
var MODEL_PROFILE_KEYS = ["cheap"];
var AGENT_ICON_NAMES = [
  "bot",
  "cpu",
  "brain",
  "zap",
  "rocket",
  "code",
  "terminal",
  "shield",
  "eye",
  "search",
  "wrench",
  "hammer",
  "lightbulb",
  "sparkles",
  "star",
  "heart",
  "flame",
  "bug",
  "cog",
  "database",
  "globe",
  "lock",
  "mail",
  "message-square",
  "file-code",
  "git-branch",
  "package",
  "puzzle",
  "target",
  "wand",
  "atom",
  "circuit-board",
  "radar",
  "swords",
  "telescope",
  "microscope",
  "crown",
  "gem",
  "hexagon",
  "pentagon",
  "fingerprint"
];
var PROJECT_ICON_NAMES = [
  "folder",
  "rocket",
  "code",
  "terminal",
  "database",
  "globe",
  "package",
  "boxes",
  "box",
  "layers",
  "briefcase",
  "compass",
  "target",
  "flame",
  "zap",
  "star",
  "bug",
  "wrench",
  "hammer",
  "lightbulb",
  "sparkles",
  "shield",
  "lock",
  "search",
  "cog",
  "brain",
  "cpu",
  "git-branch",
  "file-code",
  "puzzle",
  "gem",
  "atom",
  "heart",
  "mail",
  "message-square",
  "crown",
  "radar",
  "telescope",
  "hexagon"
];
var ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled"
];
var INBOX_MINE_ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done"
];
var INBOX_MINE_ISSUE_STATUS_FILTER = INBOX_MINE_ISSUE_STATUSES.join(",");
var ISSUE_PRIORITIES = ["critical", "high", "medium", "low"];
var ISSUE_WORK_MODES = ["standard", "ask", "planning", "skill_test"];
var ISSUE_HARNESS_KINDS = ["skill_test"];
var MAX_ISSUE_REQUEST_DEPTH = 1024;
var ISSUE_COMMENT_AUTHOR_TYPES = ["user", "agent", "system"];
var ISSUE_COMMENT_PRESENTATION_KINDS = ["message", "system_notice"];
var ISSUE_COMMENT_PRESENTATION_TONES = ["neutral", "info", "success", "warning", "danger"];
var ISSUE_COMMENT_METADATA_ROW_TYPES = [
  "text",
  "code",
  "key_value",
  "issue_link",
  "agent_link",
  "run_link"
];
function clampIssueRequestDepth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(MAX_ISSUE_REQUEST_DEPTH, Math.max(0, Math.floor(value)));
}
var ISSUE_THREAD_INTERACTION_KINDS = [
  "suggest_tasks",
  "ask_user_questions",
  "request_confirmation",
  "request_checkbox_confirmation",
  "request_item_verdicts"
];
var REQUEST_CHECKBOX_CONFIRMATION_OPTION_LIMIT = 200;
var REQUEST_ITEM_VERDICTS_ITEM_LIMIT = REQUEST_CHECKBOX_CONFIRMATION_OPTION_LIMIT;
var ISSUE_THREAD_INTERACTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "answered",
  "cancelled",
  "expired",
  "failed"
];
var ISSUE_THREAD_INTERACTION_CONTINUATION_POLICIES = [
  "none",
  "wake_assignee",
  "wake_assignee_on_accept"
];
var ISSUE_WATCHDOG_DISCOVERY_KINDS = ["product_bug", "platform_bug"];
var ISSUE_SURFACE_VISIBILITIES = ["default", "plugin_operation"];
var ISSUE_RECOVERY_ACTION_KINDS = [
  "missing_disposition",
  "stranded_assigned_issue",
  "workspace_validation",
  "configuration_validation",
  "active_run_watchdog",
  "issue_graph_liveness"
];
var ISSUE_RECOVERY_ACTION_STATUSES = [
  "active",
  "escalated",
  "resolved",
  "cancelled"
];
var ISSUE_RECOVERY_ACTION_OWNER_TYPES = [
  "agent",
  "user",
  "board",
  "system"
];
var ISSUE_RECOVERY_ACTION_OUTCOMES = [
  "restored",
  "delegated",
  "false_positive",
  "blocked",
  "escalated",
  "cancelled"
];
var ISSUE_TREE_CONTROL_MODES = ["pause", "resume", "cancel", "restore"];
var ISSUE_TREE_HOLD_RELEASE_POLICY_STRATEGIES = ["manual", "after_active_runs_finish"];
var ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY = "continuation-summary";
var PIPELINE_CASE_BODY_DOCUMENT_KEY = "pipeline-case-body";
var SYSTEM_ISSUE_DOCUMENT_KEYS = [
  ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY,
  PIPELINE_CASE_BODY_DOCUMENT_KEY
];
var SYSTEM_ISSUE_DOCUMENT_KEY_SET = new Set(SYSTEM_ISSUE_DOCUMENT_KEYS);
var DOCUMENT_ANNOTATION_THREAD_STATUSES = ["open", "resolved"];
var DOCUMENT_ANNOTATION_ANCHOR_STATES = ["active", "stale", "orphaned"];
var DOCUMENT_ANNOTATION_ANCHOR_CONFIDENCES = [
  "exact",
  "duplicate",
  "fuzzy",
  "ambiguous",
  "missing"
];
var EXTERNAL_OBJECT_STATUS_CATEGORIES = [
  "unknown",
  "open",
  "waiting",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "closed",
  "archived",
  "auth_required",
  "unreachable"
];
var EXTERNAL_OBJECT_STATUS_TONES = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
  "muted"
];
var EXTERNAL_OBJECT_LIVENESS_STATES = [
  "unknown",
  "fresh",
  "stale",
  "auth_required",
  "unreachable"
];
var EXTERNAL_OBJECT_MENTION_SOURCE_KINDS = [
  "title",
  "description",
  "comment",
  "document",
  "property",
  "plugin"
];
var EXTERNAL_OBJECT_MENTION_CONFIDENCES = ["exact", "likely", "possible"];
var ISSUE_EXECUTION_POLICY_MODES = ["normal", "auto"];
var ISSUE_EXECUTION_STAGE_TYPES = ["review", "approval"];
var ISSUE_MONITOR_SCHEDULED_BY = ["assignee", "board"];
var ISSUE_EXECUTION_MONITOR_KINDS = ["external_service"];
var ISSUE_EXECUTION_MONITOR_RECOVERY_POLICIES = [
  "wake_owner",
  "create_recovery_issue",
  "escalate_to_board"
];
var ISSUE_EXECUTION_STATE_STATUSES = ["idle", "pending", "changes_requested", "completed"];
var ISSUE_EXECUTION_MONITOR_STATE_STATUSES = ["scheduled", "triggered", "cleared"];
var ISSUE_EXECUTION_MONITOR_CLEAR_REASONS = [
  "manual",
  "triggered",
  "done",
  "cancelled",
  "invalid_status",
  "invalid_assignee",
  "dispatch_skipped",
  "timeout_exceeded",
  "max_attempts_exhausted"
];
var ISSUE_EXECUTION_DECISION_OUTCOMES = ["approved", "changes_requested"];
var GOAL_LEVELS = ["company", "team", "agent", "task"];
var GOAL_STATUSES = ["planned", "active", "achieved", "cancelled"];
var PROJECT_STATUSES = [
  "backlog",
  "planned",
  "in_progress",
  "completed",
  "cancelled"
];
var PROJECT_ACCESS_MODES = ["company", "restricted"];
var PROJECT_ACCESS_ROLES = ["viewer", "collaborator", "manager"];
var ENVIRONMENT_DRIVERS = ["local", "ssh", "sandbox", "plugin"];
var ENVIRONMENT_STATUSES = ["active", "archived"];
var ENVIRONMENT_LEASE_STATUSES = ["active", "released", "expired", "failed", "retained", "pending_cleanup"];
var ENVIRONMENT_LEASE_CLEANUP_STATUSES = ["pending", "success", "failed"];
var ENVIRONMENT_CUSTOM_IMAGE_TEMPLATE_KINDS = [
  "snapshot",
  "image",
  "provider_template",
  "unknown"
];
var ENVIRONMENT_CUSTOM_IMAGE_TEMPLATE_STATUSES = [
  "active",
  "superseded",
  "revoked",
  "failed"
];
var ENVIRONMENT_CUSTOM_IMAGE_SETUP_SESSION_STATUSES = [
  "starting",
  "waiting_for_user",
  "capturing",
  "promoted",
  "cancelled",
  "timed_out",
  "failed"
];
var ENVIRONMENT_CUSTOM_IMAGE_SETUP_CONNECTION_TYPES = [
  "ssh",
  "browser_terminal",
  "unknown"
];
var ROUTINE_STATUSES = ["active", "paused", "archived"];
var ROUTINE_CONCURRENCY_POLICIES = ["coalesce_if_active", "always_enqueue", "skip_if_active"];
var ROUTINE_CATCH_UP_POLICIES = ["skip_missed", "enqueue_missed_with_cap"];
var ROUTINE_TRIGGER_KINDS = ["schedule", "webhook", "api"];
var ROUTINE_TRIGGER_SIGNING_MODES = ["bearer", "hmac_sha256", "github_hmac", "none"];
var ROUTINE_VARIABLE_TYPES = ["text", "textarea", "number", "boolean", "select", "date"];
var APPROVAL_TYPES = [
  "hire_agent",
  "approve_ceo_strategy",
  "budget_override_required",
  "request_board_approval"
];
var SECRET_PROVIDERS = [
  "local_encrypted",
  "aws_secrets_manager",
  "gcp_secret_manager",
  "vault"
];
var SECRET_PROVIDER_CONFIG_STATUSES = [
  "ready",
  "warning",
  "coming_soon",
  "disabled"
];
var SECRET_STATUSES = ["active", "disabled", "archived", "deleted"];
var SECRET_MANAGED_MODES = ["paperclip_managed", "external_reference"];
var SECRET_BINDING_TARGET_TYPES = [
  "agent",
  "project",
  "environment",
  "routine",
  "plugin",
  "issue",
  "run",
  "system"
];
var STORAGE_PROVIDERS = ["local_disk", "s3"];
var BILLING_TYPES = [
  "metered_api",
  "subscription_included",
  "subscription_overage",
  "credits",
  "fixed",
  "unknown"
];
var FINANCE_EVENT_KINDS = [
  "inference_charge",
  "platform_fee",
  "credit_purchase",
  "credit_refund",
  "credit_expiry",
  "byok_fee",
  "gateway_overhead",
  "log_storage_charge",
  "logpush_charge",
  "provisioned_capacity_charge",
  "training_charge",
  "custom_model_import_charge",
  "custom_model_storage_charge",
  "manual_adjustment"
];
var FINANCE_DIRECTIONS = ["debit", "credit"];
var FINANCE_UNITS = [
  "input_token",
  "output_token",
  "cached_input_token",
  "request",
  "credit_usd",
  "credit_unit",
  "model_unit_minute",
  "model_unit_hour",
  "gb_month",
  "train_token",
  "unknown"
];
var BUDGET_SCOPE_TYPES = ["company", "agent", "project"];
var BUDGET_METRICS = ["billed_cents"];
var BUDGET_WINDOW_KINDS = ["calendar_month_utc", "lifetime"];
var BUDGET_INCIDENT_RESOLUTION_ACTIONS = [
  "keep_paused",
  "raise_budget_and_resume"
];
var HUMAN_COMPANY_MEMBERSHIP_ROLES = [
  "owner",
  "admin",
  "operator",
  "viewer"
];
var INVITE_JOIN_TYPES = ["human", "agent", "both"];
var JOIN_REQUEST_TYPES = ["human", "agent"];
var JOIN_REQUEST_STATUSES = ["pending_approval", "approved", "rejected"];
var PERMISSION_KEYS = [
  "agents:create",
  "agents:configure",
  "agents:suggest-changes",
  "skills:create",
  "skills:suggest-changes",
  "environments:manage",
  "users:invite",
  "users:manage_permissions",
  "tasks:assign",
  "tasks:assign_scope",
  "tasks:manage_active_checkouts",
  "pipelines:write",
  "joins:approve"
];
var PLUGIN_STATUSES = [
  "installed",
  "ready",
  "disabled",
  "error",
  "upgrade_pending",
  "uninstalled"
];
var PLUGIN_CATEGORIES = [
  "connector",
  "workspace",
  "automation",
  "ui"
];
var PLUGIN_CAPABILITIES = [
  // Data Read
  "companies.read",
  "projects.read",
  "project.workspaces.read",
  "project.workspaces.write",
  "execution.workspaces.read",
  "issues.read",
  "issue.relations.read",
  "issue.subtree.read",
  "issue.comments.read",
  "issue.documents.read",
  "agents.read",
  "goals.read",
  "goals.create",
  "goals.update",
  "activity.read",
  "costs.read",
  "issues.orchestration.read",
  "access.members.read",
  "access.invites.read",
  "authorization.grants.read",
  "authorization.policies.read",
  "authorization.audit.read",
  "database.namespace.read",
  // Data Write
  "issues.create",
  "issues.update",
  "issue.relations.write",
  "issues.checkout",
  "issues.wakeup",
  "issues.report",
  "issue.comments.create",
  "issue.interactions.create",
  "issue.documents.write",
  "projects.managed",
  "routines.managed",
  "skills.managed",
  "agents.pause",
  "agents.resume",
  "agents.invoke",
  "agents.managed",
  "access.members.write",
  "access.invites.write",
  "authorization.grants.write",
  "authorization.policies.write",
  "agent.sessions.create",
  "agent.sessions.list",
  "agent.sessions.send",
  "agent.sessions.close",
  "activity.log.write",
  "metrics.write",
  "telemetry.track",
  "database.namespace.migrate",
  "database.namespace.write",
  "external.objects.detect",
  "external.objects.read",
  "external.objects.write",
  "external.objects.refresh",
  // Memory Providers
  "memory.providers.register",
  // Plugin State
  "plugin.state.read",
  "plugin.state.write",
  // Runtime / Integration
  "events.subscribe",
  "events.emit",
  "jobs.schedule",
  "webhooks.receive",
  "api.routes.register",
  "http.outbound",
  "secrets.read-ref",
  "environment.drivers.register",
  "local.folders",
  // Agent Tools
  "agent.tools.register",
  "agent.tools.dynamic.register",
  // Memory lifecycle publication (Workplanes and trusted workflow plugins)
  "memory.lifecycle.publish",
  // UI
  "instance.settings.register",
  "ui.sidebar.register",
  "ui.page.register",
  "ui.detailTab.register",
  "ui.dashboardWidget.register",
  "ui.commentAnnotation.register",
  "ui.action.register"
];
var PLUGIN_MEMORY_SCOPES = [
  "company",
  "project",
  "agent",
  "room",
  "task",
  "artifact",
  "user"
];
var PLUGIN_MEMORY_LIFECYCLE_EVENTS = [
  "project.created",
  "room.checkpoint",
  "room.compacted",
  "task.completed",
  "task.blocked",
  "task.reopened",
  "artifact.published"
];
var PLUGIN_DATABASE_CORE_READ_TABLES = [
  "companies",
  "projects",
  "goals",
  "agents",
  "issues",
  "issue_documents",
  "issue_relations",
  "issue_comments",
  "heartbeat_runs",
  "cost_events",
  "approvals",
  "issue_approvals",
  "budget_incidents"
];
var PLUGIN_API_ROUTE_METHODS = ["GET", "POST", "PATCH", "DELETE"];
var PLUGIN_API_ROUTE_AUTH_MODES = ["board", "agent", "board-or-agent", "webhook"];
var PLUGIN_API_ROUTE_CHECKOUT_POLICIES = [
  "none",
  "required-for-agent-in-progress",
  "always-for-agent"
];
var PLUGIN_UI_SLOT_TYPES = [
  "page",
  "detailTab",
  "agentConfiguration",
  "taskDetailView",
  "dashboardWidget",
  "sidebar",
  "routeSidebar",
  "sidebarPanel",
  "projectSidebarItem",
  "globalToolbarButton",
  "toolbarButton",
  "contextMenuItem",
  "commentAnnotation",
  "commentContextMenuItem",
  "settingsPage",
  "companySettingsPage"
];
var WORKSPACE_OVERVIEW_DEFAULT_LIMIT = 50;
var WORKSPACE_OVERVIEW_MAX_LIMIT = 100;
var PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS = [
  "dashboard",
  "onboarding",
  "companies",
  "company",
  "settings",
  "plugins",
  "org",
  "agents",
  "projects",
  "issues",
  "goals",
  "approvals",
  "costs",
  "activity",
  "inbox",
  "workspaces",
  "design-guide",
  "tests"
];
var PLUGIN_RESERVED_COMPANY_SETTINGS_ROUTE_SEGMENTS = [
  "general",
  "environments",
  "access",
  "members",
  "invites",
  "secrets",
  "instance"
];
var PLUGIN_LAUNCHER_PLACEMENT_ZONES = [
  "page",
  "detailTab",
  "taskDetailView",
  "dashboardWidget",
  "sidebar",
  "sidebarPanel",
  "projectSidebarItem",
  "globalToolbarButton",
  "toolbarButton",
  "contextMenuItem",
  "commentAnnotation",
  "commentContextMenuItem",
  "settingsPage"
];
var PLUGIN_LAUNCHER_ACTIONS = [
  "navigate",
  "openModal",
  "openDrawer",
  "openPopover",
  "performAction",
  "deepLink"
];
var PLUGIN_LAUNCHER_BOUNDS = [
  "inline",
  "compact",
  "default",
  "wide",
  "full"
];
var PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS = [
  "hostInline",
  "hostOverlay",
  "hostRoute",
  "external",
  "iframe"
];
var PLUGIN_UI_SLOT_ENTITY_TYPES = [
  "project",
  "issue",
  "agent",
  "goal",
  "run",
  "comment",
  "execution_workspace",
  "project_workspace"
];
var PLUGIN_STATE_SCOPE_KINDS = [
  "instance",
  "company",
  "project",
  "project_workspace",
  "agent",
  "issue",
  "thread",
  "goal",
  "run"
];
var PLUGIN_EVENT_TYPES = [
  "company.created",
  "company.updated",
  "project.created",
  "project.updated",
  "project.workspace_created",
  "project.workspace_updated",
  "project.workspace_deleted",
  "issue.created",
  "issue.updated",
  "issue.comment.created",
  "issue.document.created",
  "issue.document.updated",
  "issue.document.deleted",
  "issue.relations.updated",
  "issue.checked_out",
  "issue.released",
  "issue.assignment_wakeup_requested",
  "agent.created",
  "agent.updated",
  "agent.deleted",
  "agent.status_changed",
  "agent.error_cleared",
  "agent.run.started",
  "agent.run.finished",
  "agent.run.failed",
  "agent.run.cancelled",
  "goal.created",
  "goal.updated",
  "approval.created",
  "approval.decided",
  "budget.incident.opened",
  "budget.incident.resolved",
  "cost_event.created",
  "activity.logged",
  ...PLUGIN_MEMORY_LIFECYCLE_EVENTS
];

// ../../external/sps-core/packages/shared/src/adapter-type.ts
var agentAdapterTypeSchema = external_exports.string().trim().min(1).default("process").describe(`Known built-in adapters: ${AGENT_ADAPTER_TYPES.join(", ")}. External adapters may register additional non-empty string types at runtime.`);
var optionalAgentAdapterTypeSchema = external_exports.string().trim().min(1).optional();

// ../../external/sps-core/packages/shared/src/agent-platform-contract.ts
var AGENT_PLATFORM_CONTRACT_VERSION = "1.0";
var agentPlatformScopeSchema = external_exports.object({
  organizationId: external_exports.string().min(1),
  projectId: external_exports.string().min(1).nullable().optional(),
  workItemId: external_exports.string().min(1).nullable().optional(),
  threadId: external_exports.string().min(1).nullable().optional(),
  agentId: external_exports.string().min(1).nullable().optional(),
  artifactId: external_exports.string().min(1).nullable().optional()
});
var agentPlatformThreadStatusSchema = external_exports.enum(["active", "closed", "archived"]);
var agentPlatformRunStatusSchema = external_exports.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "timed_out"
]);
var agentPlatformBackendKindSchema = external_exports.enum([
  "adapter",
  "node",
  "sandbox",
  "remote_service"
]);
var agentPlatformWorkItemStatusSchema = external_exports.enum([
  "open",
  "active",
  "blocked",
  "in_review",
  "completed",
  "cancelled"
]);
var agentPlatformStoreKindSchema = external_exports.enum([
  "memory",
  "state",
  "artifact",
  "external"
]);
var agentPlatformStoreHealthSchema = external_exports.enum(["unknown", "ready", "degraded", "unavailable"]);
var agentPlatformExtensionKindSchema = external_exports.enum([
  "workplane",
  "store_provider",
  "backend_provider",
  "surface"
]);
var agentPlatformThreadSchema = external_exports.object({
  id: external_exports.string().min(1),
  scope: agentPlatformScopeSchema,
  agentId: external_exports.string().min(1),
  status: agentPlatformThreadStatusSchema,
  backendId: external_exports.string().min(1).nullable(),
  lastRunId: external_exports.string().min(1).nullable(),
  lastError: external_exports.string().nullable(),
  createdAt: external_exports.string().datetime(),
  updatedAt: external_exports.string().datetime()
});
var agentPlatformRunSchema = external_exports.object({
  id: external_exports.string().min(1),
  scope: agentPlatformScopeSchema,
  threadId: external_exports.string().min(1).nullable(),
  agentId: external_exports.string().min(1),
  backendId: external_exports.string().min(1).nullable(),
  status: agentPlatformRunStatusSchema,
  startedAt: external_exports.string().datetime().nullable(),
  finishedAt: external_exports.string().datetime().nullable(),
  error: external_exports.string().nullable(),
  createdAt: external_exports.string().datetime()
});
var agentPlatformBackendSchema = external_exports.object({
  id: external_exports.string().min(1),
  organizationId: external_exports.string().min(1),
  kind: agentPlatformBackendKindSchema,
  displayName: external_exports.string().min(1),
  status: external_exports.enum(["configured", "ready", "offline", "degraded", "disabled"]),
  capabilities: external_exports.array(external_exports.string().min(1))
});
var agentPlatformWorkItemSchema = external_exports.object({
  id: external_exports.string().min(1),
  scope: agentPlatformScopeSchema,
  title: external_exports.string().min(1),
  status: agentPlatformWorkItemStatusSchema,
  assigneeAgentId: external_exports.string().min(1).nullable(),
  createdAt: external_exports.string().datetime(),
  updatedAt: external_exports.string().datetime()
});
var agentPlatformStoreSchema = external_exports.object({
  id: external_exports.string().min(1),
  organizationId: external_exports.string().min(1),
  kind: agentPlatformStoreKindSchema,
  displayName: external_exports.string().min(1),
  health: agentPlatformStoreHealthSchema,
  capabilities: external_exports.array(external_exports.string().min(1)),
  supportedScopes: external_exports.array(external_exports.enum(["organization", "project", "agent", "thread", "work_item", "artifact", "user"]))
});
var agentPlatformExtensionSchema = external_exports.object({
  id: external_exports.string().min(1),
  contractVersion: external_exports.string().min(1),
  kind: agentPlatformExtensionKindSchema,
  displayName: external_exports.string().min(1)
});
function normalizeAgentPlatformScope(scope) {
  return {
    organizationId: scope.organizationId,
    projectId: scope.projectId ?? null,
    workItemId: scope.workItemId ?? null,
    threadId: scope.threadId ?? null,
    agentId: scope.agentId ?? null,
    artifactId: scope.artifactId ?? null
  };
}
function isAgentPlatformContractCompatible(version) {
  const major = version.trim().split(".", 1)[0];
  return major === AGENT_PLATFORM_CONTRACT_VERSION.split(".", 1)[0];
}

// ../../external/sps-core/packages/shared/src/frontmatter.ts
var SKILL_FRONTMATTER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var skillMetadataValueSchema = external_exports.lazy(
  () => external_exports.union([
    external_exports.string(),
    external_exports.number(),
    external_exports.boolean(),
    external_exports.null(),
    external_exports.array(skillMetadataValueSchema),
    external_exports.record(skillMetadataValueSchema)
  ])
);
var skillFrontmatterSchema = external_exports.object({
  name: external_exports.string().regex(SKILL_FRONTMATTER_SLUG_RE, "Expected a lowercase URL slug."),
  description: external_exports.string().min(1),
  "allowed-tools": external_exports.array(external_exports.string()).optional(),
  metadata: external_exports.record(skillMetadataValueSchema).optional()
}).passthrough();

// ../../external/sps-core/packages/shared/src/trust-policy.ts
var TRUST_PRESETS = ["standard", "low_trust_review"];
var LOW_TRUST_REVIEW_PRESET = "low_trust_review";
var LOW_TRUST_REVIEW_PRESET_VERSION = 1;
var LOW_TRUST_REVIEW_RAW_OUTPUT_DISPOSITION = "quarantine";

// ../../external/sps-core/packages/shared/src/network-bind.ts
function normalizeHost(host) {
  const trimmed = host?.trim();
  return trimmed ? trimmed : void 0;
}
function isLoopbackHost(host) {
  const normalized = normalizeHost(host)?.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}
function isAllInterfacesHost(host) {
  const normalized = normalizeHost(host)?.toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::";
}
function inferBindModeFromHost(host, opts) {
  const normalized = normalizeHost(host);
  const tailnetBindHost = normalizeHost(opts?.tailnetBindHost);
  if (!normalized || isLoopbackHost(normalized)) return "loopback";
  if (isAllInterfacesHost(normalized)) return "lan";
  if (tailnetBindHost && normalized === tailnetBindHost) return "tailnet";
  return "custom";
}
function validateConfiguredBindMode(input) {
  const bind = input.bind ?? inferBindModeFromHost(input.host);
  const customBindHost = normalizeHost(input.customBindHost);
  const errors = [];
  if (input.deploymentMode === "local_trusted" && bind !== "loopback") {
    errors.push("local_trusted requires server.bind=loopback");
  }
  if (bind === "custom" && !customBindHost) {
    const legacyHost = normalizeHost(input.host);
    if (!legacyHost || isLoopbackHost(legacyHost) || isAllInterfacesHost(legacyHost)) {
      errors.push("server.customBindHost is required when server.bind=custom");
    }
  }
  if (input.deploymentMode === "authenticated" && input.deploymentExposure === "public" && bind === "tailnet") {
    errors.push("server.bind=tailnet is only supported for authenticated/private deployments");
  }
  return errors;
}

// ../../external/sps-core/packages/shared/src/types/instance.ts
var DAILY_RETENTION_PRESETS = [3, 7, 14];
var WEEKLY_RETENTION_PRESETS = [1, 2, 4];
var MONTHLY_RETENTION_PRESETS = [1, 3, 6];
var DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS = 24;
var MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS = 1;
var MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS = 24 * 30;
var DEFAULT_BACKUP_RETENTION = {
  dailyDays: 7,
  weeklyWeeks: 4,
  monthlyMonths: 1
};

// ../../external/sps-core/packages/shared/src/types/search.ts
var COMPANY_SEARCH_SCOPES = ["all", "issues", "comments", "documents", "artifacts", "agents", "projects"];
var COMPANY_SEARCH_SORTS = ["relevance", "updated", "created", "priority"];

// ../../external/sps-core/packages/shared/src/types/resource-memberships.ts
var RESOURCE_MEMBERSHIP_STATES = ["joined", "left"];

// ../../external/sps-core/packages/shared/src/validators/sidebar-preferences.ts
var sidebarOrderedIdSchema = external_exports.string().uuid();
var sidebarOrderPreferenceSchema = external_exports.object({
  orderedIds: external_exports.array(sidebarOrderedIdSchema),
  updatedAt: external_exports.coerce.date().nullable()
});
var upsertSidebarOrderPreferenceSchema = external_exports.object({
  orderedIds: external_exports.array(sidebarOrderedIdSchema)
});

// ../../external/sps-core/packages/shared/src/validators/resource-memberships.ts
var resourceMembershipStateSchema = external_exports.enum(RESOURCE_MEMBERSHIP_STATES);
var updateResourceMembershipSchema = external_exports.object({
  state: resourceMembershipStateSchema.optional(),
  starred: external_exports.boolean().optional()
}).refine((value) => value.state !== void 0 || value.starred !== void 0, {
  message: "state or starred is required"
}).refine((value) => !(value.state === "left" && value.starred === true), {
  message: "starred resources must be joined",
  path: ["starred"]
});

// ../../external/sps-core/packages/shared/src/validators/execution-workspace.ts
var executionWorkspaceStatusSchema = external_exports.enum([
  "active",
  "idle",
  "in_review",
  "archived",
  "cleanup_failed"
]);
var workspaceOverviewStatusFilterSchema = external_exports.preprocess((value) => {
  if (value === void 0 || value === null) return void 0;
  const rawValues = Array.isArray(value) ? value : [value];
  const statuses = rawValues.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    return entry.split(",").map((part) => part.trim()).filter(Boolean);
  });
  return statuses.length > 0 ? statuses : void 0;
}, external_exports.array(executionWorkspaceStatusSchema).optional());
var workspaceOverviewQuerySchema = external_exports.object({
  projectId: external_exports.string().uuid().optional(),
  status: workspaceOverviewStatusFilterSchema,
  limit: external_exports.coerce.number().int().min(1).max(WORKSPACE_OVERVIEW_MAX_LIMIT).optional().default(WORKSPACE_OVERVIEW_DEFAULT_LIMIT),
  offset: external_exports.coerce.number().int().min(0).optional().default(0)
}).strict();
var executionWorkspaceConfigSchema = external_exports.object({
  environmentId: external_exports.string().uuid().optional().nullable(),
  provisionCommand: external_exports.string().optional().nullable(),
  teardownCommand: external_exports.string().optional().nullable(),
  cleanupCommand: external_exports.string().optional().nullable(),
  workspaceRuntime: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  desiredState: external_exports.enum(["running", "stopped", "manual"]).optional().nullable(),
  serviceStates: external_exports.record(external_exports.enum(["running", "stopped", "manual"])).optional().nullable()
}).strict();
var workspaceRuntimeControlTargetSchema = external_exports.object({
  workspaceCommandId: external_exports.string().min(1).optional().nullable(),
  runtimeServiceId: external_exports.string().uuid().optional().nullable(),
  serviceIndex: external_exports.number().int().nonnegative().optional().nullable()
}).strict();
var executionWorkspaceCloseReadinessStateSchema = external_exports.enum([
  "ready",
  "ready_with_warnings",
  "blocked"
]);
var executionWorkspaceCloseActionKindSchema = external_exports.enum([
  "archive_record",
  "stop_runtime_services",
  "cleanup_command",
  "teardown_command",
  "git_worktree_remove",
  "git_branch_delete",
  "remove_local_directory"
]);
var executionWorkspaceCloseActionSchema = external_exports.object({
  kind: executionWorkspaceCloseActionKindSchema,
  label: external_exports.string(),
  description: external_exports.string(),
  command: external_exports.string().nullable()
}).strict();
var executionWorkspaceCloseLinkedIssueSchema = external_exports.object({
  id: external_exports.string().uuid(),
  identifier: external_exports.string().nullable(),
  title: external_exports.string(),
  status: external_exports.string(),
  isTerminal: external_exports.boolean()
}).strict();
var executionWorkspaceCloseGitReadinessSchema = external_exports.object({
  repoRoot: external_exports.string().nullable(),
  workspacePath: external_exports.string().nullable(),
  branchName: external_exports.string().nullable(),
  baseRef: external_exports.string().nullable(),
  hasDirtyTrackedFiles: external_exports.boolean(),
  hasUntrackedFiles: external_exports.boolean(),
  dirtyEntryCount: external_exports.number().int().nonnegative(),
  untrackedEntryCount: external_exports.number().int().nonnegative(),
  aheadCount: external_exports.number().int().nonnegative().nullable(),
  behindCount: external_exports.number().int().nonnegative().nullable(),
  isMergedIntoBase: external_exports.boolean().nullable(),
  createdByRuntime: external_exports.boolean()
}).strict();
var workspaceRuntimeServiceSchema = external_exports.object({
  id: external_exports.string(),
  companyId: external_exports.string().uuid(),
  projectId: external_exports.string().uuid().nullable(),
  projectWorkspaceId: external_exports.string().uuid().nullable(),
  executionWorkspaceId: external_exports.string().uuid().nullable(),
  issueId: external_exports.string().uuid().nullable(),
  scopeType: external_exports.enum(["project_workspace", "execution_workspace", "run", "agent"]),
  scopeId: external_exports.string().nullable(),
  serviceName: external_exports.string(),
  status: external_exports.enum(["starting", "running", "stopped", "failed"]),
  lifecycle: external_exports.enum(["shared", "ephemeral"]),
  reuseKey: external_exports.string().nullable(),
  command: external_exports.string().nullable(),
  cwd: external_exports.string().nullable(),
  port: external_exports.number().int().nullable(),
  url: external_exports.string().nullable(),
  provider: external_exports.enum(["local_process", "adapter_managed"]),
  providerRef: external_exports.string().nullable(),
  ownerAgentId: external_exports.string().uuid().nullable(),
  startedByRunId: external_exports.string().uuid().nullable(),
  lastUsedAt: external_exports.coerce.date(),
  startedAt: external_exports.coerce.date(),
  stoppedAt: external_exports.coerce.date().nullable(),
  stopPolicy: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  healthStatus: external_exports.enum(["unknown", "healthy", "unhealthy"]),
  configIndex: external_exports.number().int().nonnegative().nullable().optional(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date()
}).strict();
var executionWorkspaceCloseReadinessSchema = external_exports.object({
  workspaceId: external_exports.string().uuid(),
  state: executionWorkspaceCloseReadinessStateSchema,
  blockingReasons: external_exports.array(external_exports.string()),
  warnings: external_exports.array(external_exports.string()),
  linkedIssues: external_exports.array(executionWorkspaceCloseLinkedIssueSchema),
  plannedActions: external_exports.array(executionWorkspaceCloseActionSchema),
  isDestructiveCloseAllowed: external_exports.boolean(),
  isSharedWorkspace: external_exports.boolean(),
  isProjectPrimaryWorkspace: external_exports.boolean(),
  git: executionWorkspaceCloseGitReadinessSchema.nullable(),
  runtimeServices: external_exports.array(workspaceRuntimeServiceSchema)
}).strict();
var updateExecutionWorkspaceSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  cwd: external_exports.string().optional().nullable(),
  repoUrl: external_exports.string().optional().nullable(),
  baseRef: external_exports.string().optional().nullable(),
  branchName: external_exports.string().optional().nullable(),
  providerRef: external_exports.string().optional().nullable(),
  status: executionWorkspaceStatusSchema.optional(),
  cleanupEligibleAt: external_exports.string().datetime().optional().nullable(),
  cleanupReason: external_exports.string().optional().nullable(),
  config: executionWorkspaceConfigSchema.optional().nullable(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
}).strict();
var branchReconcileReasonSchema = external_exports.string().trim().min(1);
var reconcileExecutionWorkspaceBranchSchema = external_exports.discriminatedUnion("mode", [
  external_exports.object({
    mode: external_exports.literal("forward"),
    reason: branchReconcileReasonSchema.optional().nullable()
  }).strict(),
  external_exports.object({
    mode: external_exports.literal("override"),
    reason: branchReconcileReasonSchema
  }).strict(),
  external_exports.object({
    mode: external_exports.literal("quarantine_restore"),
    reason: branchReconcileReasonSchema.optional().nullable()
  }).strict()
]);

// ../../external/sps-core/packages/shared/src/types/feedback.ts
var FEEDBACK_TARGET_TYPES = ["issue_comment", "issue_document_revision"];
var FEEDBACK_VOTE_VALUES = ["up", "down"];
var FEEDBACK_DATA_SHARING_PREFERENCES = ["allowed", "not_allowed", "prompt"];
var DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE = "prompt";
var FEEDBACK_TRACE_STATUSES = ["local_only", "pending", "sent", "failed"];

// ../../external/sps-core/packages/shared/src/validators/feedback.ts
var feedbackTargetTypeSchema = external_exports.enum(FEEDBACK_TARGET_TYPES);
var feedbackTraceStatusSchema = external_exports.enum(FEEDBACK_TRACE_STATUSES);
var feedbackVoteValueSchema = external_exports.enum(FEEDBACK_VOTE_VALUES);
var feedbackDataSharingPreferenceSchema = external_exports.enum(FEEDBACK_DATA_SHARING_PREFERENCES);
var upsertIssueFeedbackVoteSchema = external_exports.object({
  targetType: feedbackTargetTypeSchema,
  targetId: external_exports.string().uuid(),
  vote: feedbackVoteValueSchema,
  reason: external_exports.string().trim().max(1e3).optional(),
  allowSharing: external_exports.boolean().optional()
});

// ../../external/sps-core/packages/shared/src/validators/instance.ts
function presetSchema(presets, label) {
  return external_exports.number().refine(
    (v) => presets.includes(v),
    { message: `${label} must be one of: ${presets.join(", ")}` }
  );
}
var backupRetentionPolicySchema = external_exports.object({
  dailyDays: presetSchema(DAILY_RETENTION_PRESETS, "dailyDays").default(DEFAULT_BACKUP_RETENTION.dailyDays),
  weeklyWeeks: presetSchema(WEEKLY_RETENTION_PRESETS, "weeklyWeeks").default(DEFAULT_BACKUP_RETENTION.weeklyWeeks),
  monthlyMonths: presetSchema(MONTHLY_RETENTION_PRESETS, "monthlyMonths").default(DEFAULT_BACKUP_RETENTION.monthlyMonths)
});
var instanceGeneralSettingsSchema = external_exports.object({
  censorUsernameInLogs: external_exports.boolean().default(false),
  keyboardShortcuts: external_exports.boolean().default(false),
  feedbackDataSharingPreference: feedbackDataSharingPreferenceSchema.default(
    DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE
  ),
  backupRetention: backupRetentionPolicySchema.default(DEFAULT_BACKUP_RETENTION),
  // Execution policy. Absent/"any" = unrestricted; "kubernetes" forces the
  // Kubernetes sandbox provider and denies local/ssh execution (cloud_tenant).
  executionMode: external_exports.enum(["kubernetes", "any"]).optional()
}).strict();
var patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.partial();
var instanceExperimentalSettingsSchema = external_exports.object({
  enableEnvironments: external_exports.boolean().default(false),
  enableIsolatedWorkspaces: external_exports.boolean().default(false),
  enableStreamlinedLeftNavigation: external_exports.boolean().default(true),
  enablePipelines: external_exports.boolean().default(false),
  enableCases: external_exports.boolean().default(false),
  enableConferenceRoomChat: external_exports.boolean().default(false),
  enableTaskWatchdogs: external_exports.boolean().default(false),
  enableIssuePlanDecompositions: external_exports.boolean().default(false),
  enableExperimentalFileViewer: external_exports.boolean().default(false),
  enableCloudSync: external_exports.boolean().default(false),
  enableExternalObjects: external_exports.boolean().default(false),
  enableBuiltInAgents: external_exports.boolean().default(false),
  enableDecisions: external_exports.boolean().default(false),
  enableGoalsSidebarLink: external_exports.boolean().default(false),
  enableServerInfoDebugView: external_exports.boolean().default(false),
  autoRestartDevServerWhenIdle: external_exports.boolean().default(false),
  enableIssueGraphLivenessAutoRecovery: external_exports.boolean().default(false),
  enableWorkspaceBranchReconcileForward: external_exports.boolean().default(true),
  enableWorkspaceDirtyQuarantineRepair: external_exports.boolean().default(true),
  enableWorktreeRunExecution: external_exports.boolean().default(false),
  worktreeRunExecutionActivatedAt: external_exports.string().datetime().nullable().default(null),
  worktreeRunExecutionActivationInstanceId: external_exports.string().min(1).nullable().default(null),
  issueGraphLivenessAutoRecoveryLookbackHours: external_exports.number().int().min(MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS).max(MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS).default(DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS)
}).strict();
var patchInstanceExperimentalSettingsSchema = instanceExperimentalSettingsSchema.omit({
  worktreeRunExecutionActivatedAt: true,
  worktreeRunExecutionActivationInstanceId: true
}).partial().strip();
var patchInstanceSettingsSchema = external_exports.object({
  defaultEnvironmentId: external_exports.string().uuid().nullable().optional()
}).strict();
var issueGraphLivenessAutoRecoveryRequestSchema = external_exports.object({
  lookbackHours: external_exports.number().int().min(MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS).max(MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS).optional()
}).strict();
var instanceSettingsSchema = external_exports.object({
  id: external_exports.string().uuid(),
  defaultEnvironmentId: external_exports.string().uuid().nullable(),
  general: instanceGeneralSettingsSchema,
  experimental: instanceExperimentalSettingsSchema,
  createdAt: external_exports.union([external_exports.date(), external_exports.string().datetime()]),
  updatedAt: external_exports.union([external_exports.date(), external_exports.string().datetime()])
}).strict();

// ../../external/sps-core/packages/shared/src/validators/budget.ts
var upsertBudgetPolicySchema = external_exports.object({
  scopeType: external_exports.enum(BUDGET_SCOPE_TYPES),
  scopeId: external_exports.string().uuid(),
  metric: external_exports.enum(BUDGET_METRICS).optional().default("billed_cents"),
  windowKind: external_exports.enum(BUDGET_WINDOW_KINDS).optional().default("calendar_month_utc"),
  amount: external_exports.number().int().nonnegative(),
  warnPercent: external_exports.number().int().min(1).max(99).optional().default(80),
  hardStopEnabled: external_exports.boolean().optional().default(true),
  notifyEnabled: external_exports.boolean().optional().default(true),
  isActive: external_exports.boolean().optional().default(true)
});
var resolveBudgetIncidentSchema = external_exports.object({
  action: external_exports.enum(BUDGET_INCIDENT_RESOLUTION_ACTIONS),
  amount: external_exports.number().int().nonnegative().optional(),
  decisionNote: external_exports.string().optional().nullable()
}).superRefine((value, ctx) => {
  if (value.action === "raise_budget_and_resume" && typeof value.amount !== "number") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "amount is required when raising a budget",
      path: ["amount"]
    });
  }
});

// ../../external/sps-core/packages/shared/src/validators/company.ts
var logoAssetIdSchema = external_exports.string().uuid().nullable().optional();
var brandColorSchema = external_exports.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional();
var feedbackDataSharingTermsVersionSchema = external_exports.string().min(1).nullable().optional();
var attachmentMaxBytesSchema = external_exports.number().int().min(1).max(MAX_COMPANY_ATTACHMENT_MAX_BYTES);
var createCompanySchema = external_exports.object({
  name: external_exports.string().min(1),
  description: external_exports.string().optional().nullable(),
  budgetMonthlyCents: external_exports.number().int().nonnegative().optional().default(0),
  attachmentMaxBytes: attachmentMaxBytesSchema.optional(),
  defaultResponsibleUserId: external_exports.string().min(1).nullable().optional()
});
var updateCompanySchema = createCompanySchema.partial().extend({
  status: external_exports.enum(COMPANY_STATUSES).optional(),
  spentMonthlyCents: external_exports.number().int().nonnegative().optional(),
  requireBoardApprovalForNewAgents: external_exports.boolean().optional(),
  feedbackDataSharingEnabled: external_exports.boolean().optional(),
  feedbackDataSharingConsentAt: external_exports.coerce.date().nullable().optional(),
  feedbackDataSharingConsentByUserId: external_exports.string().min(1).nullable().optional(),
  feedbackDataSharingTermsVersion: feedbackDataSharingTermsVersionSchema,
  brandColor: brandColorSchema,
  logoAssetId: logoAssetIdSchema,
  attachmentMaxBytes: attachmentMaxBytesSchema.optional()
});
var updateCompanyBrandingSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  description: external_exports.string().nullable().optional(),
  brandColor: brandColorSchema,
  logoAssetId: logoAssetIdSchema
}).strict().refine(
  (value) => value.name !== void 0 || value.description !== void 0 || value.brandColor !== void 0 || value.logoAssetId !== void 0,
  "At least one branding field must be provided"
);

// ../../external/sps-core/packages/shared/src/validators/secret.ts
var secretKeySchema = external_exports.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.-]+$/);
var secretVersionSelectorSchema = external_exports.union([external_exports.literal("latest"), external_exports.number().int().positive()]);
var creatableSecretStatusSchema = external_exports.enum(["active", "disabled", "archived"]);
var envBindingPlainSchema = external_exports.object({
  type: external_exports.literal("plain"),
  value: external_exports.string()
});
var envBindingSecretRefSchema = external_exports.object({
  type: external_exports.literal("secret_ref"),
  secretId: external_exports.string().uuid(),
  version: secretVersionSelectorSchema.optional()
});
var envBindingUserSecretRefSchema = external_exports.object({
  type: external_exports.literal("user_secret_ref"),
  key: secretKeySchema,
  version: secretVersionSelectorSchema.optional(),
  required: external_exports.boolean().optional().default(true),
  allowMissingOverride: external_exports.boolean().optional().default(false)
});
var envBindingSchema = external_exports.union([
  external_exports.string(),
  envBindingPlainSchema,
  envBindingSecretRefSchema,
  envBindingUserSecretRefSchema
]);
var envConfigSchema = external_exports.record(external_exports.string(), envBindingSchema);
var createSecretSchema = external_exports.object({
  name: external_exports.string().min(1),
  key: secretKeySchema.optional(),
  provider: external_exports.enum(SECRET_PROVIDERS).optional(),
  providerConfigId: external_exports.string().uuid().optional().nullable(),
  managedMode: external_exports.enum(SECRET_MANAGED_MODES).optional(),
  value: external_exports.string().min(1).optional().nullable(),
  description: external_exports.string().optional().nullable(),
  externalRef: external_exports.string().optional().nullable(),
  providerMetadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  providerVersionRef: external_exports.string().optional().nullable()
}).superRefine((value, ctx) => {
  if ((value.managedMode ?? "paperclip_managed") === "external_reference") {
    if (!value.externalRef?.trim()) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["externalRef"],
        message: "External reference secrets require externalRef"
      });
    }
    return;
  }
  if (value.externalRef?.trim()) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["externalRef"],
      message: "Managed secrets cannot set externalRef"
    });
  }
  if (!value.value?.trim()) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["value"],
      message: "Managed secrets require value"
    });
  }
});
function requireSecretRotationInput(value, ctx) {
  if (!value.value?.trim() && !value.externalRef?.trim() && value.providerVersionRef == null && value.providerConfigId == null) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["value"],
      message: "Secret rotation requires value, externalRef, providerVersionRef, or providerConfigId"
    });
  }
}
var rotateSecretSchema = external_exports.object({
  value: external_exports.string().min(1).optional().nullable(),
  externalRef: external_exports.string().optional().nullable(),
  providerVersionRef: external_exports.string().optional().nullable(),
  providerConfigId: external_exports.string().uuid().optional().nullable()
}).superRefine(requireSecretRotationInput);
var updateSecretSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  key: secretKeySchema.optional(),
  status: external_exports.enum(SECRET_STATUSES).optional(),
  providerConfigId: external_exports.string().uuid().optional().nullable(),
  description: external_exports.string().optional().nullable(),
  externalRef: external_exports.string().optional().nullable(),
  providerMetadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
});
var secretBindingTargetSchema = external_exports.object({
  targetType: external_exports.enum(SECRET_BINDING_TARGET_TYPES),
  targetId: external_exports.string().min(1),
  configPath: external_exports.string().min(1)
});
var createSecretBindingSchema = secretBindingTargetSchema.extend({
  secretId: external_exports.string().uuid(),
  versionSelector: secretVersionSelectorSchema.default("latest"),
  required: external_exports.boolean().default(true),
  label: external_exports.string().optional().nullable()
});
var createUserSecretDefinitionSchema = external_exports.object({
  key: secretKeySchema,
  name: external_exports.string().trim().min(1).max(160),
  description: external_exports.string().trim().max(500).optional().nullable(),
  status: creatableSecretStatusSchema.optional(),
  provider: external_exports.enum(SECRET_PROVIDERS).optional(),
  providerConfigId: external_exports.string().uuid().optional().nullable(),
  managedMode: external_exports.enum(SECRET_MANAGED_MODES).optional(),
  providerMetadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  usageGuidance: external_exports.string().trim().max(1e3).optional().nullable()
});
var updateUserSecretDefinitionSchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(160).optional(),
  description: external_exports.string().trim().max(500).optional().nullable(),
  status: external_exports.enum(SECRET_STATUSES).optional(),
  providerConfigId: external_exports.string().uuid().optional().nullable(),
  providerMetadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  usageGuidance: external_exports.string().trim().max(1e3).optional().nullable()
});
var createUserSecretValueSchema = external_exports.object({
  definitionKey: secretKeySchema.optional(),
  definitionId: external_exports.string().uuid().optional(),
  value: external_exports.string().min(1).optional().nullable(),
  externalRef: external_exports.string().optional().nullable(),
  providerVersionRef: external_exports.string().optional().nullable(),
  providerConfigId: external_exports.string().uuid().optional().nullable()
}).superRefine((value, ctx) => {
  if (!value.definitionKey && !value.definitionId) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["definitionId"],
      message: "User secret value requires definitionId or definitionKey"
    });
  }
  if (!value.value?.trim() && !value.externalRef?.trim()) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["value"],
      message: "User secret value requires value or externalRef"
    });
  }
});
var updateUserSecretValueSchema = external_exports.object({
  status: external_exports.enum(SECRET_STATUSES).optional(),
  value: external_exports.string().min(1).optional().nullable(),
  externalRef: external_exports.string().min(1).optional().nullable(),
  providerVersionRef: external_exports.string().min(1).optional().nullable(),
  providerConfigId: external_exports.string().uuid().optional().nullable()
});
var rotateUserSecretValueSchema = external_exports.object({
  value: external_exports.string().min(1).optional().nullable(),
  externalRef: external_exports.string().min(1).optional().nullable(),
  providerVersionRef: external_exports.string().min(1).optional().nullable(),
  providerConfigId: external_exports.string().uuid().optional().nullable()
}).superRefine(requireSecretRotationInput);
var createUserSecretDeclarationSchema = secretBindingTargetSchema.extend({
  definitionKey: secretKeySchema,
  envKey: external_exports.string().trim().min(1),
  versionSelector: secretVersionSelectorSchema.default("latest"),
  required: external_exports.boolean().default(true),
  allowMissingOverride: external_exports.boolean().default(false),
  label: external_exports.string().optional().nullable()
});
var safeShortText = external_exports.string().trim().min(1).max(160);
var optionalSafeShortText = safeShortText.optional().nullable();
var deniedProviderConfigKeyPattern = /^(access[-_]?key([-_]?id)?|secret[-_]?access[-_]?key|secret[-_]?key|token|password|passwd|credential|credentials|private[-_]?key|pem|jwt|session[-_]?token|service[-_]?account([-_]?json)?|client[-_]?secret|secret[-_]?id|unseal[-_]?key|recovery[-_]?key|key[-_]?file([-_]?path)?|token[-_]?file([-_]?path)?)$/i;
function rejectSensitiveProviderConfigKeys(value, ctx) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!deniedProviderConfigKeyPattern.test(key)) continue;
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["config", key],
      message: `Provider vault config cannot persist sensitive field: ${key}`
    });
  }
}
var localEncryptedProviderConfigSchema = external_exports.object({
  backupReminderAcknowledged: external_exports.boolean().optional()
}).strict();
var awsSecretsManagerProviderConfigSchema = external_exports.object({
  region: external_exports.string().trim().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/, "Invalid AWS region"),
  namespace: optionalSafeShortText,
  secretNamePrefix: optionalSafeShortText,
  kmsKeyId: external_exports.string().trim().min(1).max(512).optional().nullable(),
  ownerTag: optionalSafeShortText,
  environmentTag: optionalSafeShortText
}).strict();
var gcpSecretManagerProviderConfigSchema = external_exports.object({
  projectId: external_exports.string().trim().min(1).max(128).regex(/^[a-z][a-z0-9-]{4,127}$/).optional().nullable(),
  location: optionalSafeShortText,
  namespace: optionalSafeShortText,
  secretNamePrefix: optionalSafeShortText
}).strict();
var vaultAddressSchema = external_exports.preprocess(
  (value) => typeof value === "string" ? value.trim() : value,
  external_exports.string().url().superRefine((value, ctx) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    const hasPath = url.pathname !== "" && url.pathname !== "/";
    if (url.protocol !== "http:" && url.protocol !== "https:" || url.username || url.password || url.search || url.hash || hasPath) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Vault address must be an origin-only HTTP(S) URL without credentials, path, query, or fragment"
      });
    }
  }).transform((value) => new URL(value).origin)
);
function rejectUnsafeVaultAddress(value, ctx) {
  if (value === void 0 || value === null) return;
  const parsed = vaultAddressSchema.safeParse(value);
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    ctx.addIssue({
      ...issue,
      path: ["config", "address", ...issue.path]
    });
  }
}
var vaultProviderConfigSchema = external_exports.object({
  address: vaultAddressSchema.optional().nullable(),
  namespace: optionalSafeShortText,
  mountPath: optionalSafeShortText,
  secretPathPrefix: optionalSafeShortText
}).strict();
var secretProviderConfigPayloadSchema = external_exports.discriminatedUnion("provider", [
  external_exports.object({ provider: external_exports.literal("local_encrypted"), config: localEncryptedProviderConfigSchema }),
  external_exports.object({ provider: external_exports.literal("aws_secrets_manager"), config: awsSecretsManagerProviderConfigSchema }),
  external_exports.object({ provider: external_exports.literal("gcp_secret_manager"), config: gcpSecretManagerProviderConfigSchema }),
  external_exports.object({ provider: external_exports.literal("vault"), config: vaultProviderConfigSchema })
]);
var createSecretProviderConfigSchema = external_exports.object({
  provider: external_exports.enum(SECRET_PROVIDERS),
  displayName: external_exports.string().trim().min(1).max(120),
  status: external_exports.enum(SECRET_PROVIDER_CONFIG_STATUSES).optional(),
  isDefault: external_exports.boolean().optional(),
  config: external_exports.record(external_exports.string(), external_exports.unknown()).default({})
}).superRefine((value, ctx) => {
  rejectSensitiveProviderConfigKeys(value.config, ctx);
  const parsed = secretProviderConfigPayloadSchema.safeParse({
    provider: value.provider,
    config: value.config
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        ...issue,
        path: issue.path[0] === "config" ? issue.path : ["config", ...issue.path]
      });
    }
  }
  const status = value.status ?? (["gcp_secret_manager", "vault"].includes(value.provider) ? "coming_soon" : "ready");
  if ((value.provider === "gcp_secret_manager" || value.provider === "vault") && status !== "coming_soon" && status !== "disabled") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["status"],
      message: `${value.provider} provider vaults are locked while coming soon`
    });
  }
  if ((status === "coming_soon" || status === "disabled") && value.isDefault) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["isDefault"],
      message: "Only ready or warning provider vaults can be default"
    });
  }
});
var updateSecretProviderConfigSchema = external_exports.object({
  displayName: external_exports.string().trim().min(1).max(120).optional(),
  status: external_exports.enum(SECRET_PROVIDER_CONFIG_STATUSES).optional(),
  isDefault: external_exports.boolean().optional(),
  config: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
}).superRefine((value, ctx) => {
  if (value.config !== void 0) {
    rejectSensitiveProviderConfigKeys(value.config, ctx);
    rejectUnsafeVaultAddress(value.config.address, ctx);
  }
  if ((value.status === "coming_soon" || value.status === "disabled") && value.isDefault) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["isDefault"],
      message: "Only ready or warning provider vaults can be default"
    });
  }
});
var remoteSecretImportPreviewSchema = external_exports.object({
  providerConfigId: external_exports.string().uuid(),
  query: external_exports.string().trim().max(200).optional().nullable(),
  nextToken: external_exports.string().trim().min(1).max(4096).optional().nullable(),
  pageSize: external_exports.number().int().min(1).max(100).optional()
});
var secretProviderConfigDiscoveryPreviewSchema = external_exports.object({
  provider: external_exports.enum(SECRET_PROVIDERS),
  config: external_exports.record(external_exports.unknown()).default({}),
  query: external_exports.string().trim().max(200).optional().nullable(),
  nextToken: external_exports.string().trim().min(1).max(4096).optional().nullable(),
  pageSize: external_exports.number().int().min(1).max(100).optional()
}).superRefine((value, ctx) => {
  rejectSensitiveProviderConfigKeys(value.config, ctx);
  const parsed = secretProviderConfigPayloadSchema.safeParse({
    provider: value.provider,
    config: value.config
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        ...issue,
        path: issue.path[0] === "config" ? issue.path : ["config", ...issue.path]
      });
    }
  }
});
var remoteSecretImportSelectionSchema = external_exports.object({
  externalRef: external_exports.string().trim().min(1).max(2048),
  name: external_exports.string().trim().min(1).max(160).optional().nullable(),
  key: external_exports.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.-]+$/).optional().nullable(),
  description: external_exports.string().trim().max(500).optional().nullable(),
  providerVersionRef: external_exports.string().trim().min(1).max(512).optional().nullable(),
  providerMetadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
});
var remoteSecretImportSchema = external_exports.object({
  providerConfigId: external_exports.string().uuid(),
  secrets: external_exports.array(remoteSecretImportSelectionSchema).min(1).max(100)
});

// ../../external/sps-core/packages/shared/src/validators/environment.ts
var environmentDriverSchema = external_exports.enum(ENVIRONMENT_DRIVERS);
var environmentStatusSchema = external_exports.enum(ENVIRONMENT_STATUSES);
var environmentLeaseStatusSchema = external_exports.enum(ENVIRONMENT_LEASE_STATUSES);
var environmentLeaseCleanupStatusSchema = external_exports.enum(ENVIRONMENT_LEASE_CLEANUP_STATUSES);
var environmentFields = {
  name: external_exports.string().min(1),
  description: external_exports.string().optional().nullable(),
  driver: environmentDriverSchema,
  status: environmentStatusSchema.optional().default("active"),
  config: external_exports.record(external_exports.string(), external_exports.unknown()).optional().default({}),
  envVars: envConfigSchema.optional().default({}),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
};
var createEnvironmentSchema = external_exports.object(environmentFields).strict();
var updateEnvironmentSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  description: external_exports.string().optional().nullable(),
  driver: environmentDriverSchema.optional(),
  status: environmentStatusSchema.optional(),
  config: external_exports.record(external_exports.string(), external_exports.unknown()).optional(),
  envVars: envConfigSchema.optional(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
}).strict();
var probeEnvironmentConfigSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  description: external_exports.string().optional().nullable(),
  driver: environmentDriverSchema,
  config: external_exports.record(external_exports.string(), external_exports.unknown()).optional().default({}),
  envVars: envConfigSchema.optional().default({}),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
}).strict();

// ../../external/sps-core/packages/shared/src/validators/environment-custom-images.ts
var isoDateTime = external_exports.union([external_exports.date(), external_exports.string().datetime()]);
var providerKeySchema = external_exports.string().min(1).max(200);
var optionalRecordSchema = external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable();
var environmentCustomImageTemplateKindSchema = external_exports.enum(ENVIRONMENT_CUSTOM_IMAGE_TEMPLATE_KINDS);
var environmentCustomImageTemplateStatusSchema = external_exports.enum(ENVIRONMENT_CUSTOM_IMAGE_TEMPLATE_STATUSES);
var environmentCustomImageSetupSessionStatusSchema = external_exports.enum(
  ENVIRONMENT_CUSTOM_IMAGE_SETUP_SESSION_STATUSES
);
var environmentCustomImageSetupConnectionTypeSchema = external_exports.enum(
  ENVIRONMENT_CUSTOM_IMAGE_SETUP_CONNECTION_TYPES
);
var environmentCustomImageSetupConnectionSummarySchema = external_exports.object({
  type: environmentCustomImageSetupConnectionTypeSchema,
  username: external_exports.string().min(1).max(200).optional().nullable(),
  hostRedacted: external_exports.literal(true).optional().default(true),
  portRedacted: external_exports.literal(true).optional().default(true),
  label: external_exports.string().min(1).max(200).optional().nullable(),
  instructions: external_exports.string().min(1).max(1e3).optional().nullable()
}).strict();
var environmentCustomImageTemplateSchema = external_exports.object({
  id: external_exports.string().uuid(),
  environmentId: external_exports.string().uuid(),
  provider: providerKeySchema,
  templateKind: environmentCustomImageTemplateKindSchema,
  templateRef: external_exports.string().min(1).nullable(),
  sourceTemplateRef: external_exports.string().min(1).nullable(),
  sourceEnvironmentConfigFingerprint: external_exports.string().min(1).nullable(),
  status: environmentCustomImageTemplateStatusSchema,
  createdByUserId: external_exports.string().min(1).nullable(),
  createdByAgentId: external_exports.string().uuid().nullable(),
  capturedAt: isoDateTime.nullable(),
  lastUsedAt: isoDateTime.nullable(),
  supersededByTemplateId: external_exports.string().uuid().nullable(),
  metadata: optionalRecordSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime
}).strict();
var environmentCustomImageSetupSessionSchema = external_exports.object({
  id: external_exports.string().uuid(),
  environmentId: external_exports.string().uuid(),
  templateId: external_exports.string().uuid().nullable(),
  promotedTemplateId: external_exports.string().uuid().nullable(),
  provider: providerKeySchema,
  providerLeaseId: external_exports.string().min(1).nullable(),
  environmentLeaseId: external_exports.string().uuid().nullable(),
  status: environmentCustomImageSetupSessionStatusSchema,
  startedByUserId: external_exports.string().min(1).nullable(),
  startedByAgentId: external_exports.string().uuid().nullable(),
  baseTemplateRef: external_exports.string().min(1).nullable(),
  expiresAt: isoDateTime.nullable(),
  finishedAt: isoDateTime.nullable(),
  failureReason: external_exports.string().min(1).nullable(),
  connectionSummary: environmentCustomImageSetupConnectionSummarySchema.nullable(),
  connectionSecretRef: external_exports.string().min(1).nullable(),
  metadata: optionalRecordSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime
}).strict();
var startEnvironmentCustomImageSetupSessionSchema = external_exports.object({
  templateId: external_exports.string().uuid().optional().nullable(),
  ttlSeconds: external_exports.number().int().min(60).max(24 * 60 * 60).optional()
}).strict();
var finishEnvironmentCustomImageSetupSessionSchema = external_exports.object({
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
}).strict();
var cancelEnvironmentCustomImageSetupSessionSchema = external_exports.object({
  reason: external_exports.string().min(1).max(1e3).optional()
}).strict();
var createEnvironmentCustomImageTerminalSessionTokenSchema = external_exports.object({}).strict().default({});
var environmentCustomImageTerminalSessionTokenSchema = external_exports.object({
  id: external_exports.string().min(1),
  token: external_exports.string().min(32),
  expiresAt: isoDateTime,
  setupSessionId: external_exports.string().min(1),
  environmentId: external_exports.string().min(1),
  connectionType: external_exports.literal("ssh"),
  websocketPath: external_exports.string().min(1)
}).strict();

// ../../external/sps-core/packages/shared/src/validators/external-object.ts
var externalObjectStatusCategorySchema = external_exports.enum(EXTERNAL_OBJECT_STATUS_CATEGORIES);
var externalObjectStatusToneSchema = external_exports.enum(EXTERNAL_OBJECT_STATUS_TONES);
var externalObjectLivenessStateSchema = external_exports.enum(EXTERNAL_OBJECT_LIVENESS_STATES);
var externalObjectMentionSourceKindSchema = external_exports.enum(EXTERNAL_OBJECT_MENTION_SOURCE_KINDS);
var externalObjectMentionConfidenceSchema = external_exports.enum(EXTERNAL_OBJECT_MENTION_CONFIDENCES);
var externalObjectProviderKeySchema = external_exports.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_.-]*$/);
var externalObjectTypeSchema = external_exports.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/);
var externalObjectCanonicalIdentitySchema = external_exports.object({
  scheme: external_exports.enum(["http", "https"]),
  host: external_exports.string().trim().min(1),
  path: external_exports.string().trim().min(1),
  queryParamHashes: external_exports.record(external_exports.string().regex(/^[a-f0-9]{64}$/)).optional()
}).strict();
var externalObjectMentionSourceSchema = external_exports.object({
  sourceKind: externalObjectMentionSourceKindSchema,
  documentKey: external_exports.string().trim().min(1).optional().nullable(),
  propertyKey: external_exports.string().trim().min(1).optional().nullable()
}).strict();

// ../../external/sps-core/packages/shared/src/validators/company-skill.ts
var companySkillSourceTypeSchema = external_exports.enum(["local_path", "github", "url", "catalog", "skills_sh"]);
var companySkillTrustLevelSchema = external_exports.enum(["markdown_only", "assets", "scripts_executables"]);
var companySkillCompatibilitySchema = external_exports.enum(["compatible", "unknown", "invalid"]);
var companySkillSourceBadgeSchema = external_exports.enum(["paperclip", "github", "local", "url", "catalog", "skills_sh"]);
var companySkillSharingScopeSchema = external_exports.enum(["private", "company", "public_link"]);
var companySkillListSortSchema = external_exports.enum(["alphabetical", "recent", "installs", "stars", "agents", "forks"]);
var companySkillListIncludeSchema = external_exports.enum(["lastEditor"]);
var companySkillFileInventoryEntrySchema = external_exports.object({
  path: external_exports.string().min(1),
  kind: external_exports.enum(["skill", "markdown", "reference", "script", "asset", "other"])
});
var companySkillVersionFileInventoryEntrySchema = companySkillFileInventoryEntrySchema.extend({
  content: external_exports.string()
});
var companySkillSchema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  key: external_exports.string().min(1),
  slug: external_exports.string().min(1),
  name: external_exports.string().min(1),
  description: external_exports.string().nullable(),
  markdown: external_exports.string(),
  sourceType: companySkillSourceTypeSchema,
  sourceLocator: external_exports.string().nullable(),
  sourceRef: external_exports.string().nullable(),
  trustLevel: companySkillTrustLevelSchema,
  compatibility: companySkillCompatibilitySchema,
  fileInventory: external_exports.array(companySkillFileInventoryEntrySchema).default([]),
  iconUrl: external_exports.string().nullable(),
  color: external_exports.string().nullable(),
  tagline: external_exports.string().nullable(),
  authorName: external_exports.string().nullable(),
  homepageUrl: external_exports.string().nullable(),
  categories: external_exports.array(external_exports.string().min(1)).default([]),
  sharingScope: companySkillSharingScopeSchema,
  publicShareToken: external_exports.string().nullable(),
  forkedFromSkillId: external_exports.string().uuid().nullable(),
  forkedFromCompanyId: external_exports.string().uuid().nullable(),
  starCount: external_exports.number().int().nonnegative(),
  installCount: external_exports.number().int().nonnegative(),
  forkCount: external_exports.number().int().nonnegative(),
  currentVersionId: external_exports.string().uuid().nullable(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date()
});
var companySkillListItemSchema = companySkillSchema.extend({
  attachedAgentCount: external_exports.number().int().nonnegative(),
  editable: external_exports.boolean(),
  editableReason: external_exports.string().nullable(),
  sourceLabel: external_exports.string().nullable(),
  sourceBadge: companySkillSourceBadgeSchema,
  catalogKind: external_exports.enum(["bundled", "optional"]).nullable(),
  originHash: external_exports.string().nullable(),
  packageName: external_exports.string().nullable(),
  packageVersion: external_exports.string().nullable(),
  lastEditor: external_exports.object({
    kind: external_exports.enum(["user", "agent"]),
    id: external_exports.string().min(1),
    name: external_exports.string().nullable(),
    imageUrl: external_exports.string().nullable()
  }).nullable().optional()
});
var companySkillUsageAgentSchema = external_exports.object({
  id: external_exports.string().uuid(),
  name: external_exports.string().min(1),
  urlKey: external_exports.string().min(1),
  adapterType: external_exports.string().min(1),
  desired: external_exports.boolean(),
  actualState: external_exports.string().nullable().describe(
    "Runtime adapter skill state when explicitly fetched; company skill detail reads return null without probing agent runtimes."
  ),
  versionId: external_exports.string().uuid().nullable()
});
var companySkillOriginalSummarySchema = external_exports.object({
  id: external_exports.string().uuid(),
  name: external_exports.string().min(1),
  slug: external_exports.string().min(1),
  sourceType: companySkillSourceTypeSchema,
  sourceLocator: external_exports.string().nullable(),
  sourceRef: external_exports.string().nullable()
});
var companySkillForkSummarySchema = companySkillOriginalSummarySchema.extend({
  key: external_exports.string().min(1),
  forkedFromSkillId: external_exports.string().uuid().nullable(),
  forkedFromCompanyId: external_exports.string().uuid().nullable(),
  currentVersionId: external_exports.string().uuid().nullable(),
  createdByCurrentActor: external_exports.boolean(),
  diverged: external_exports.boolean(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date()
});
var companySkillListQuerySchema = external_exports.object({
  q: external_exports.string().min(1).optional(),
  sort: companySkillListSortSchema.optional(),
  categories: external_exports.array(external_exports.string().min(1)).optional(),
  scope: companySkillSharingScopeSchema.optional(),
  include: external_exports.array(companySkillListIncludeSchema).optional()
});
var companySkillCategoryCountSchema = external_exports.object({
  slug: external_exports.string().min(1),
  count: external_exports.number().int().nonnegative()
});
var companySkillVersionSchema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  companySkillId: external_exports.string().uuid(),
  revisionNumber: external_exports.number().int().positive(),
  label: external_exports.string().nullable(),
  fileInventory: external_exports.array(companySkillVersionFileInventoryEntrySchema).default([]),
  authorAgentId: external_exports.string().uuid().nullable(),
  authorUserId: external_exports.string().nullable(),
  createdAt: external_exports.coerce.date()
});
var companySkillDetailSchema = companySkillSchema.extend({
  attachedAgentCount: external_exports.number().int().nonnegative(),
  usedByAgents: external_exports.array(companySkillUsageAgentSchema).default([]),
  existingForks: external_exports.array(companySkillForkSummarySchema).default([]),
  editable: external_exports.boolean(),
  editableReason: external_exports.string().nullable(),
  sourceLabel: external_exports.string().nullable(),
  sourceBadge: companySkillSourceBadgeSchema,
  currentVersion: companySkillVersionSchema.nullable(),
  starredByCurrentActor: external_exports.boolean()
});
var companySkillVersionCreateSchema = external_exports.object({
  label: external_exports.string().trim().min(1).nullable().optional()
}).default({});
var companySkillStarResultSchema = external_exports.object({
  skillId: external_exports.string().uuid(),
  starred: external_exports.boolean(),
  starCount: external_exports.number().int().nonnegative()
});
var companySkillCommentSchema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  companySkillId: external_exports.string().uuid(),
  parentCommentId: external_exports.string().uuid().nullable(),
  authorAgentId: external_exports.string().uuid().nullable(),
  authorUserId: external_exports.string().nullable(),
  body: external_exports.string(),
  deletedAt: external_exports.coerce.date().nullable(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date()
});
var companySkillCommentCreateSchema = external_exports.object({
  body: external_exports.string().min(1),
  parentCommentId: external_exports.string().uuid().nullable().optional()
});
var companySkillCommentUpdateSchema = external_exports.object({
  body: external_exports.string().min(1)
});
var companySkillForkSchema = external_exports.object({
  name: external_exports.string().min(1).nullable().optional(),
  slug: external_exports.string().min(1).nullable().optional(),
  sharingScope: companySkillSharingScopeSchema.optional(),
  reassignAgentIds: external_exports.array(external_exports.string().uuid()).optional()
}).default({});
var companySkillForkReassignmentSchema = external_exports.object({
  agentId: external_exports.string().uuid(),
  previousSkillKey: external_exports.string().min(1),
  nextSkillKey: external_exports.string().min(1)
});
var companySkillForkResultSchema = external_exports.object({
  skill: companySkillSchema,
  original: companySkillOriginalSummarySchema,
  reassignments: external_exports.array(companySkillForkReassignmentSchema)
});
var companySkillForkPrecheckResultSchema = external_exports.object({
  skillId: external_exports.string().uuid(),
  original: companySkillOriginalSummarySchema,
  agentUsageCount: external_exports.number().int().nonnegative(),
  usedByAgents: external_exports.array(companySkillUsageAgentSchema),
  existingForks: external_exports.array(companySkillForkSummarySchema)
});
var companySkillUpdateSchema = external_exports.object({
  description: external_exports.string().nullable().optional(),
  iconUrl: external_exports.string().nullable().optional(),
  color: external_exports.string().nullable().optional(),
  tagline: external_exports.string().max(120).nullable().optional(),
  authorName: external_exports.string().nullable().optional(),
  homepageUrl: external_exports.string().nullable().optional(),
  categories: external_exports.array(external_exports.string().min(1)).optional(),
  sharingScope: companySkillSharingScopeSchema.optional()
}).default({});
var companySkillUpdateStatusSchema = external_exports.object({
  supported: external_exports.boolean(),
  reason: external_exports.string().nullable(),
  trackingRef: external_exports.string().nullable(),
  currentRef: external_exports.string().nullable(),
  latestRef: external_exports.string().nullable(),
  hasUpdate: external_exports.boolean(),
  installedHash: external_exports.string().nullable(),
  originHash: external_exports.string().nullable(),
  userModifiedAt: external_exports.string().nullable(),
  updateHoldReason: external_exports.enum([
    "local_modifications",
    "audit_hard_stop",
    "origin_unavailable",
    "compatibility_invalid",
    "operator_hold"
  ]).nullable(),
  auditVerdict: external_exports.enum(["pass", "warning", "fail"]).nullable(),
  auditCodes: external_exports.array(external_exports.string())
});
var companySkillAuditFindingSchema = external_exports.object({
  code: external_exports.string().min(1),
  severity: external_exports.enum(["warning", "error"]),
  message: external_exports.string().min(1),
  path: external_exports.string().nullable()
});
var companySkillAuditResultSchema = external_exports.object({
  skillId: external_exports.string().uuid(),
  installedHash: external_exports.string().nullable(),
  originHash: external_exports.string().nullable(),
  verdict: external_exports.enum(["pass", "warning", "fail"]),
  codes: external_exports.array(external_exports.string()),
  findings: external_exports.array(companySkillAuditFindingSchema),
  scannedAt: external_exports.string().min(1),
  scanVersion: external_exports.string().min(1)
});
var companySkillInstallUpdateSchema = external_exports.object({
  force: external_exports.boolean().optional()
}).default({});
var companySkillResetSchema = external_exports.object({
  force: external_exports.boolean().optional()
}).default({});
var companySkillImportSchema = external_exports.object({
  source: external_exports.string().min(1)
});
var companySkillProjectScanRequestSchema = external_exports.object({
  projectIds: external_exports.array(external_exports.string().uuid()).optional(),
  workspaceIds: external_exports.array(external_exports.string().uuid()).optional()
});
var companySkillProjectScanSkippedSchema = external_exports.object({
  projectId: external_exports.string().uuid(),
  projectName: external_exports.string().min(1),
  workspaceId: external_exports.string().uuid().nullable(),
  workspaceName: external_exports.string().nullable(),
  path: external_exports.string().nullable(),
  reason: external_exports.string().min(1)
});
var companySkillProjectScanConflictSchema = external_exports.object({
  slug: external_exports.string().min(1),
  key: external_exports.string().min(1),
  projectId: external_exports.string().uuid(),
  projectName: external_exports.string().min(1),
  workspaceId: external_exports.string().uuid(),
  workspaceName: external_exports.string().min(1),
  path: external_exports.string().min(1),
  existingSkillId: external_exports.string().uuid(),
  existingSkillKey: external_exports.string().min(1),
  existingSourceLocator: external_exports.string().nullable(),
  reason: external_exports.string().min(1)
});
var companySkillProjectScanResultSchema = external_exports.object({
  scannedProjects: external_exports.number().int().nonnegative(),
  scannedWorkspaces: external_exports.number().int().nonnegative(),
  discovered: external_exports.number().int().nonnegative(),
  imported: external_exports.array(companySkillSchema),
  updated: external_exports.array(companySkillSchema),
  skipped: external_exports.array(companySkillProjectScanSkippedSchema),
  conflicts: external_exports.array(companySkillProjectScanConflictSchema),
  warnings: external_exports.array(external_exports.string())
});
var companySkillCreateSchema = external_exports.object({
  name: external_exports.string().min(1),
  slug: external_exports.string().min(1).nullable().optional(),
  description: external_exports.string().nullable().optional(),
  markdown: external_exports.string().nullable().optional(),
  iconUrl: external_exports.string().nullable().optional(),
  color: external_exports.string().nullable().optional(),
  tagline: external_exports.string().max(120).nullable().optional(),
  authorName: external_exports.string().nullable().optional(),
  homepageUrl: external_exports.string().nullable().optional(),
  categories: external_exports.array(external_exports.string().min(1)).optional(),
  sharingScope: companySkillSharingScopeSchema.optional(),
  forkedFromSkillId: external_exports.string().uuid().nullable().optional()
});
var companySkillFileDetailSchema = external_exports.object({
  skillId: external_exports.string().uuid(),
  path: external_exports.string().min(1),
  kind: external_exports.enum(["skill", "markdown", "reference", "script", "asset", "other"]),
  content: external_exports.string(),
  language: external_exports.string().nullable(),
  markdown: external_exports.boolean(),
  editable: external_exports.boolean()
});
var companySkillFileUpdateSchema = external_exports.object({
  path: external_exports.string().min(1),
  content: external_exports.string()
});
var companySkillFileDeleteSchema = external_exports.object({
  path: external_exports.string().min(1),
  target: external_exports.enum(["file", "folder"])
});
var companySkillTestRunStatusSchema = external_exports.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
var companySkillTestInputSchema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  skillId: external_exports.string().uuid(),
  name: external_exports.string().min(1),
  content: external_exports.string(),
  createdBy: external_exports.string().nullable(),
  deletedAt: external_exports.coerce.date().nullable(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date()
});
var companySkillTestInputCreateSchema = external_exports.object({
  name: external_exports.string().trim().min(1),
  content: external_exports.string().min(1)
});
var companySkillTestInputUpdateSchema = external_exports.object({
  name: external_exports.string().trim().min(1).optional(),
  content: external_exports.string().min(1).optional()
}).refine((value) => value.name !== void 0 || value.content !== void 0, {
  message: "At least one field is required"
});
var companySkillTestRunTemplateSchema = external_exports.object({
  id: external_exports.string().min(1),
  companyId: external_exports.string().uuid(),
  name: external_exports.string().min(1),
  description: external_exports.string().nullable(),
  body: external_exports.string().min(1),
  builtIn: external_exports.boolean(),
  createdByAgentId: external_exports.string().uuid().nullable(),
  createdByUserId: external_exports.string().nullable(),
  updatedByAgentId: external_exports.string().uuid().nullable(),
  updatedByUserId: external_exports.string().nullable(),
  deletedAt: external_exports.coerce.date().nullable(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date()
});
var companySkillTestRunTemplateCreateSchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(120),
  description: external_exports.string().trim().max(500).nullable().optional(),
  body: external_exports.string().min(1).max(2e4)
});
var companySkillTestRunTemplateUpdateSchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(120).optional(),
  description: external_exports.string().trim().max(500).nullable().optional(),
  body: external_exports.string().min(1).max(2e4).optional()
}).refine(
  (value) => value.name !== void 0 || value.description !== void 0 || value.body !== void 0,
  { message: "At least one field is required" }
);
var companySkillTestRunTemplateSnapshotSchema = external_exports.object({
  templateId: external_exports.string().min(1).nullable(),
  templateName: external_exports.string().min(1).nullable(),
  templateBody: external_exports.string().min(1).max(2e4).nullable()
}).refine(
  (value) => value.templateId === null && value.templateName === null && value.templateBody === null || value.templateId !== null && value.templateName !== null && value.templateBody !== null,
  { message: "Template snapshot must be all null or include id, name, and body" }
);
var companySkillTestRunCostSummarySchema = external_exports.object({
  costCents: external_exports.number().int().nonnegative(),
  inputTokens: external_exports.number().int().nonnegative(),
  cachedInputTokens: external_exports.number().int().nonnegative(),
  outputTokens: external_exports.number().int().nonnegative()
});
var companySkillTestRunSchema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  skillId: external_exports.string().uuid(),
  inputId: external_exports.string().uuid().nullable(),
  inputSnapshot: external_exports.string(),
  skillVersionId: external_exports.string().uuid(),
  agentId: external_exports.string().uuid(),
  agentConfigSnapshot: external_exports.record(external_exports.string(), external_exports.unknown()),
  issueId: external_exports.string().uuid(),
  templateId: external_exports.string().nullable(),
  templateName: external_exports.string().nullable(),
  templateBody: external_exports.string().nullable(),
  renderedTemplateBody: external_exports.string().nullable(),
  harnessIssueDescription: external_exports.string(),
  status: companySkillTestRunStatusSchema,
  outputDocumentKey: external_exports.string().min(1),
  outputSnapshot: external_exports.string(),
  error: external_exports.string().nullable(),
  deletedAt: external_exports.coerce.date().nullable(),
  supersededAt: external_exports.coerce.date().nullable(),
  harnessIssueExpiresAt: external_exports.coerce.date().nullable(),
  harnessIssueDeletedAt: external_exports.coerce.date().nullable(),
  createdAt: external_exports.coerce.date(),
  updatedAt: external_exports.coerce.date(),
  cost: companySkillTestRunCostSummarySchema,
  taskExpired: external_exports.boolean()
});
var companySkillTestRunCreateSchema = external_exports.object({
  inputId: external_exports.string().uuid().nullable().optional(),
  content: external_exports.string().min(1).nullable().optional(),
  agentId: external_exports.string().uuid(),
  templateId: external_exports.string().min(1).nullable().optional(),
  templateSnapshot: companySkillTestRunTemplateSnapshotSchema.nullable().optional(),
  // Re-run pins the viewed run's skill version instead of the live head, so the
  // new run reproduces the same snapshots (golden-path step 5).
  skillVersionId: external_exports.string().uuid().nullable().optional()
}).refine((value) => Boolean(value.inputId) || Boolean(value.content?.trim()), {
  message: "inputId or content is required"
});
var companySkillTestRunListQuerySchema = external_exports.object({
  inputId: external_exports.string().uuid().optional()
});
var catalogSkillKindSchema = external_exports.enum(["bundled", "optional"]);
var catalogSkillFileSchema = external_exports.object({
  path: external_exports.string().min(1),
  kind: external_exports.enum(["skill", "markdown", "reference", "script", "asset", "other"]),
  sizeBytes: external_exports.number().int().nonnegative(),
  sha256: external_exports.string().min(1)
});
var catalogSkillGitHubSourceSchema = external_exports.object({
  type: external_exports.literal("github"),
  hostname: external_exports.string().min(1),
  owner: external_exports.string().min(1),
  repo: external_exports.string().min(1),
  ref: external_exports.string().min(1),
  commit: external_exports.string().regex(/^[0-9a-f]{40}$/i),
  path: external_exports.string(),
  url: external_exports.string().url()
});
var catalogSkillSourceSchema = catalogSkillGitHubSourceSchema;
var catalogSkillSchema = external_exports.object({
  id: external_exports.string().min(1),
  key: external_exports.string().min(1),
  kind: catalogSkillKindSchema,
  category: external_exports.string().min(1),
  slug: external_exports.string().min(1),
  name: external_exports.string().min(1),
  description: external_exports.string(),
  path: external_exports.string().min(1),
  entrypoint: external_exports.literal("SKILL.md"),
  trustLevel: companySkillTrustLevelSchema,
  compatibility: companySkillCompatibilitySchema,
  defaultInstall: external_exports.boolean(),
  recommendedForRoles: external_exports.array(external_exports.string()),
  requires: external_exports.array(external_exports.string()),
  tags: external_exports.array(external_exports.string()),
  files: external_exports.array(catalogSkillFileSchema),
  contentHash: external_exports.string().min(1),
  source: catalogSkillSourceSchema.optional(),
  packageName: external_exports.string().min(1).optional(),
  packageVersion: external_exports.string().min(1).optional()
});
var catalogSkillListQuerySchema = external_exports.object({
  kind: catalogSkillKindSchema.optional(),
  category: external_exports.string().min(1).optional(),
  q: external_exports.string().min(1).optional()
});
var catalogSkillFileDetailSchema = external_exports.object({
  catalogSkillId: external_exports.string().min(1),
  path: external_exports.string().min(1),
  kind: external_exports.enum(["skill", "markdown", "reference", "script", "asset", "other"]),
  content: external_exports.string(),
  language: external_exports.string().nullable(),
  markdown: external_exports.boolean()
});
var companySkillInstallCatalogSchema = external_exports.object({
  catalogSkillId: external_exports.string().min(1),
  slug: external_exports.string().min(1).nullable().optional(),
  force: external_exports.boolean().optional()
});
var companySkillInstallCatalogResultSchema = external_exports.object({
  action: external_exports.enum(["created", "updated", "unchanged"]),
  skill: companySkillSchema,
  catalogSkill: catalogSkillSchema,
  warnings: external_exports.array(external_exports.string())
});

// ../../external/sps-core/packages/shared/src/validators/text.ts
function normalizeEscapedLineBreaks(value) {
  return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
}
var multilineTextSchema = external_exports.string().transform(normalizeEscapedLineBreaks);

// ../../external/sps-core/packages/shared/src/validators/trust-policy.ts
var trustPresetSchema = external_exports.enum(TRUST_PRESETS);
var lowTrustOutputPromotionTargetSchema = external_exports.object({
  type: external_exports.literal("issue"),
  issueId: external_exports.string().uuid()
}).strict();
var lowTrustBoundarySchema = external_exports.object({
  mode: external_exports.literal(LOW_TRUST_REVIEW_PRESET),
  companyId: external_exports.string().uuid().optional(),
  projectIds: external_exports.array(external_exports.string().uuid()).optional(),
  rootIssueId: external_exports.string().uuid().optional(),
  issueIds: external_exports.array(external_exports.string().uuid()).optional(),
  allowedAgentIds: external_exports.array(external_exports.string().uuid()).optional(),
  allowedSecretBindingIds: external_exports.array(external_exports.string().uuid()).optional(),
  allowedToolClasses: external_exports.array(external_exports.string().trim().min(1)).optional(),
  outputPromotionTarget: lowTrustOutputPromotionTargetSchema.optional()
}).strict();
var lowTrustReviewPresetPolicySchema = external_exports.object({
  id: external_exports.literal(LOW_TRUST_REVIEW_PRESET),
  version: external_exports.literal(LOW_TRUST_REVIEW_PRESET_VERSION),
  rawOutputDisposition: external_exports.literal(LOW_TRUST_REVIEW_RAW_OUTPUT_DISPOSITION)
}).strict();
var trustAuthorizationPolicySchema = external_exports.object({
  trustPreset: trustPresetSchema.optional(),
  reviewPreset: lowTrustReviewPresetPolicySchema.optional(),
  trustBoundary: lowTrustBoundarySchema.optional()
}).catchall(external_exports.unknown());
var sourceTrustArtifactKindSchema = external_exports.enum(["issue", "comment", "document", "work_product"]);
var sourceTrustMetadataSchema = external_exports.object({
  preset: trustPresetSchema,
  disposition: external_exports.enum(["quarantined", "promoted"]),
  sourceIssueId: external_exports.string().uuid().nullable().optional(),
  sourceRunId: external_exports.string().uuid().nullable().optional(),
  sourceAgentId: external_exports.string().uuid().nullable().optional(),
  promotedFrom: external_exports.object({
    artifactKind: sourceTrustArtifactKindSchema,
    artifactId: external_exports.string().uuid(),
    issueId: external_exports.string().uuid().nullable().optional()
  }).strict().nullable().optional(),
  promotedByActorType: external_exports.enum(["agent", "user", "system"]).nullable().optional(),
  promotedByActorId: external_exports.string().trim().min(1).nullable().optional(),
  promotedAt: external_exports.string().datetime({ offset: true }).nullable().optional()
}).strict();

// ../../external/sps-core/packages/shared/src/validators/issue.ts
var issueBlockedInboxStateSchema = external_exports.enum([
  "needs_attention",
  "awaiting_decision",
  "external_wait",
  "recovery_open",
  "missing_disposition"
]);
var issueBlockedInboxSeveritySchema = external_exports.enum(["critical", "high", "medium", "low"]);
var issueBlockedInboxReasonSchema = external_exports.enum([
  "blocked_by_unassigned_issue",
  "blocked_by_assigned_backlog_issue",
  "blocked_by_uninvokable_assignee",
  "blocked_by_cancelled_issue",
  "blocked_chain_stalled",
  "invalid_review_participant",
  "in_review_without_action_path",
  "missing_successful_run_disposition",
  "pending_board_decision",
  "pending_user_decision",
  "external_owner_action",
  "open_recovery_issue"
]);
var issueBlockedInboxIssueRefSchema = external_exports.object({
  id: external_exports.string().uuid(),
  identifier: external_exports.string().nullable(),
  title: external_exports.string(),
  status: external_exports.enum(ISSUE_STATUSES),
  priority: external_exports.enum(ISSUE_PRIORITIES),
  assigneeAgentId: external_exports.string().uuid().nullable(),
  assigneeUserId: external_exports.string().nullable()
}).strict();
var issueBlockedInboxAttentionSchema = external_exports.object({
  kind: external_exports.literal("blocked"),
  state: issueBlockedInboxStateSchema,
  reason: issueBlockedInboxReasonSchema,
  severity: issueBlockedInboxSeveritySchema,
  stoppedSinceAt: external_exports.string().datetime().nullable(),
  owner: external_exports.object({
    type: external_exports.enum(["agent", "user", "board", "external", "unknown"]),
    agentId: external_exports.string().uuid().nullable(),
    userId: external_exports.string().nullable(),
    label: external_exports.string().nullable()
  }).strict(),
  action: external_exports.object({
    label: external_exports.string().trim().min(1),
    detail: external_exports.string().nullable()
  }).strict(),
  sourceIssue: issueBlockedInboxIssueRefSchema.nullable(),
  leafIssue: issueBlockedInboxIssueRefSchema.nullable(),
  recoveryIssue: issueBlockedInboxIssueRefSchema.nullable(),
  approvalId: external_exports.string().uuid().nullable(),
  interactionId: external_exports.string().uuid().nullable(),
  sampleIssueIdentifier: external_exports.string().nullable(),
  redaction: external_exports.object({
    externalDetailsRedacted: external_exports.boolean(),
    secretFieldsOmitted: external_exports.literal(true)
  }).strict()
}).strict();
var ISSUE_EXECUTION_WORKSPACE_PREFERENCES = [
  "inherit",
  "shared_workspace",
  "isolated_workspace",
  "operator_branch",
  "reuse_existing",
  "agent_default"
];
var executionWorkspaceStrategySchema = external_exports.object({
  type: external_exports.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
  baseRef: external_exports.string().optional().nullable(),
  branchTemplate: external_exports.string().optional().nullable(),
  worktreeParentDir: external_exports.string().optional().nullable(),
  provisionCommand: external_exports.string().optional().nullable(),
  teardownCommand: external_exports.string().optional().nullable()
}).strict();
var issueExecutionWorkspaceSettingsSchema = external_exports.object({
  mode: external_exports.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional(),
  environmentId: external_exports.string().uuid().optional().nullable(),
  workspaceStrategy: executionWorkspaceStrategySchema.optional().nullable(),
  workspaceRuntime: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
}).strict();
var issueAssigneeAdapterOverridesSchema = external_exports.object({
  modelProfile: external_exports.enum(MODEL_PROFILE_KEYS).optional(),
  adapterConfig: external_exports.record(external_exports.string(), external_exports.unknown()).optional(),
  useProjectWorkspace: external_exports.boolean().optional()
}).strict();
var issueExecutionStagePrincipalBaseSchema = external_exports.object({
  type: external_exports.enum(["agent", "user"]),
  agentId: external_exports.string().uuid().optional().nullable(),
  userId: external_exports.string().optional().nullable()
});
var issueExecutionStagePrincipalSchema = issueExecutionStagePrincipalBaseSchema.superRefine((value, ctx) => {
  if (value.type === "agent") {
    if (!value.agentId) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Agent participants require agentId", path: ["agentId"] });
    }
    if (value.userId) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Agent participants cannot set userId", path: ["userId"] });
    }
    return;
  }
  if (!value.userId) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "User participants require userId", path: ["userId"] });
  }
  if (value.agentId) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "User participants cannot set agentId", path: ["agentId"] });
  }
});
var issueExecutionStageParticipantSchema = issueExecutionStagePrincipalBaseSchema.extend({
  id: external_exports.string().uuid().optional()
}).superRefine((value, ctx) => {
  if (value.type === "agent") {
    if (!value.agentId) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Agent participants require agentId", path: ["agentId"] });
    }
    if (value.userId) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Agent participants cannot set userId", path: ["userId"] });
    }
    return;
  }
  if (!value.userId) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "User participants require userId", path: ["userId"] });
  }
  if (value.agentId) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "User participants cannot set agentId", path: ["agentId"] });
  }
});
var issueExecutionStageSchema = external_exports.object({
  id: external_exports.string().uuid().optional(),
  type: external_exports.enum(ISSUE_EXECUTION_STAGE_TYPES),
  approvalsNeeded: external_exports.literal(1).optional().default(1),
  participants: external_exports.array(issueExecutionStageParticipantSchema).default([])
});
var issueExecutionMonitorPolicySchema = external_exports.object({
  nextCheckAt: external_exports.string().datetime(),
  notes: external_exports.string().max(500).optional().nullable().default(null),
  scheduledBy: external_exports.enum(ISSUE_MONITOR_SCHEDULED_BY).optional().default("assignee"),
  kind: external_exports.enum(ISSUE_EXECUTION_MONITOR_KINDS).optional().nullable().default(null),
  serviceName: external_exports.string().trim().min(1).max(120).optional().nullable().default(null),
  externalRef: external_exports.string().trim().min(1).max(500).optional().nullable().default(null),
  timeoutAt: external_exports.string().datetime().optional().nullable().default(null),
  maxAttempts: external_exports.number().int().positive().max(100).optional().nullable().default(null),
  recoveryPolicy: external_exports.enum(ISSUE_EXECUTION_MONITOR_RECOVERY_POLICIES).optional().nullable().default(null)
});
var issueExecutionFailurePolicySchema = external_exports.object({
  automaticRetry: external_exports.boolean().optional().default(true),
  preserveAssignee: external_exports.boolean().optional().default(false),
  wakeRecoveryOwner: external_exports.boolean().optional().default(true)
}).strict();
var issueExecutionPolicySchema = external_exports.object({
  mode: external_exports.enum(ISSUE_EXECUTION_POLICY_MODES).optional().default("normal"),
  commentRequired: external_exports.boolean().optional().default(true),
  stages: external_exports.array(issueExecutionStageSchema).default([]),
  monitor: issueExecutionMonitorPolicySchema.optional().nullable(),
  reviewPreset: lowTrustReviewPresetPolicySchema.optional(),
  authorizationPolicy: trustAuthorizationPolicySchema.optional(),
  failure: issueExecutionFailurePolicySchema.optional()
});
var issueExecutionMonitorStateSchema = external_exports.object({
  status: external_exports.enum(ISSUE_EXECUTION_MONITOR_STATE_STATUSES),
  nextCheckAt: external_exports.string().datetime().nullable(),
  lastTriggeredAt: external_exports.string().datetime().nullable(),
  attemptCount: external_exports.number().int().nonnegative().default(0),
  notes: external_exports.string().max(500).nullable(),
  scheduledBy: external_exports.enum(ISSUE_MONITOR_SCHEDULED_BY).nullable(),
  kind: external_exports.enum(ISSUE_EXECUTION_MONITOR_KINDS).nullable().optional().default(null),
  serviceName: external_exports.string().trim().min(1).max(120).nullable().optional().default(null),
  externalRef: external_exports.string().trim().min(1).max(500).nullable().optional().default(null),
  timeoutAt: external_exports.string().datetime().nullable().optional().default(null),
  maxAttempts: external_exports.number().int().positive().max(100).nullable().optional().default(null),
  recoveryPolicy: external_exports.enum(ISSUE_EXECUTION_MONITOR_RECOVERY_POLICIES).nullable().optional().default(null),
  clearedAt: external_exports.string().datetime().nullable(),
  clearReason: external_exports.enum(ISSUE_EXECUTION_MONITOR_CLEAR_REASONS).nullable()
});
var issueReviewRequestSchema = external_exports.object({
  instructions: external_exports.string().trim().min(1).max(2e4)
}).strict();
var issueExecutionStateSchema = external_exports.object({
  status: external_exports.enum(ISSUE_EXECUTION_STATE_STATUSES),
  currentStageId: external_exports.string().uuid().nullable(),
  currentStageIndex: external_exports.number().int().nonnegative().nullable(),
  currentStageType: external_exports.enum(ISSUE_EXECUTION_STAGE_TYPES).nullable(),
  currentParticipant: issueExecutionStagePrincipalSchema.nullable(),
  returnAssignee: issueExecutionStagePrincipalSchema.nullable(),
  reviewRequest: issueReviewRequestSchema.nullable().optional().default(null),
  completedStageIds: external_exports.array(external_exports.string().uuid()).default([]),
  lastDecisionId: external_exports.string().uuid().nullable(),
  lastDecisionOutcome: external_exports.enum(ISSUE_EXECUTION_DECISION_OUTCOMES).nullable(),
  monitor: issueExecutionMonitorStateSchema.optional().nullable()
});
var issueRecoveryActionReadModelSchema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  sourceIssueId: external_exports.string().uuid(),
  recoveryIssueId: external_exports.string().uuid().nullable(),
  kind: external_exports.enum(ISSUE_RECOVERY_ACTION_KINDS),
  status: external_exports.enum(ISSUE_RECOVERY_ACTION_STATUSES),
  ownerType: external_exports.enum(ISSUE_RECOVERY_ACTION_OWNER_TYPES),
  ownerAgentId: external_exports.string().uuid().nullable(),
  ownerUserId: external_exports.string().nullable(),
  previousOwnerAgentId: external_exports.string().uuid().nullable(),
  returnOwnerAgentId: external_exports.string().uuid().nullable(),
  cause: external_exports.string().min(1),
  fingerprint: external_exports.string().min(1),
  evidence: external_exports.record(external_exports.string(), external_exports.unknown()),
  nextAction: external_exports.string().min(1),
  wakePolicy: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  monitorPolicy: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  attemptCount: external_exports.number().int().nonnegative(),
  maxAttempts: external_exports.number().int().positive().nullable(),
  timeoutAt: external_exports.union([external_exports.date(), external_exports.string().datetime()]).nullable(),
  lastAttemptAt: external_exports.union([external_exports.date(), external_exports.string().datetime()]).nullable(),
  outcome: external_exports.enum(ISSUE_RECOVERY_ACTION_OUTCOMES).nullable(),
  resolutionNote: external_exports.string().nullable(),
  resolvedAt: external_exports.union([external_exports.date(), external_exports.string().datetime()]).nullable(),
  createdAt: external_exports.union([external_exports.date(), external_exports.string().datetime()]),
  updatedAt: external_exports.union([external_exports.date(), external_exports.string().datetime()])
});
var RESOLVE_ISSUE_RECOVERY_ACTION_OUTCOMES = [
  "restored",
  "false_positive",
  "blocked",
  "cancelled"
];
var resolveIssueRecoveryActionSchema = external_exports.object({
  actionId: external_exports.string().uuid().optional(),
  outcome: external_exports.enum(RESOLVE_ISSUE_RECOVERY_ACTION_OUTCOMES),
  sourceIssueStatus: external_exports.enum(["todo", "done", "in_review", "blocked"]),
  resolutionNote: multilineTextSchema.optional().nullable()
}).strict().superRefine((value, ctx) => {
  if (value.outcome === "restored") {
    if (value.sourceIssueStatus !== "todo" && value.sourceIssueStatus !== "done" && value.sourceIssueStatus !== "in_review") {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Restored recovery actions must move the source issue to todo, done, or in_review",
        path: ["sourceIssueStatus"]
      });
    }
    return;
  }
  if (value.outcome === "blocked") {
    if (value.sourceIssueStatus !== "blocked") {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Blocked recovery actions must move the source issue to blocked",
        path: ["sourceIssueStatus"]
      });
    }
    return;
  }
  if (value.outcome === "false_positive" || value.outcome === "cancelled") {
    if (value.sourceIssueStatus !== "done" && value.sourceIssueStatus !== "in_review") {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "This recovery outcome requires sourceIssueStatus to be done or in_review",
        path: ["sourceIssueStatus"]
      });
    }
    return;
  }
});
var issueRequestDepthInputSchema = external_exports.number().int().nonnegative().transform((value) => clampIssueRequestDepth(value));
function resolveCreateIssueStatusDefault(input) {
  if (typeof input.status === "string") {
    return {
      status: input.status,
      defaulted: false,
      reason: "explicit"
    };
  }
  const hasAssignee = typeof input.assigneeAgentId === "string" && input.assigneeAgentId.length > 0 || typeof input.assigneeUserId === "string" && input.assigneeUserId.length > 0;
  return {
    status: hasAssignee ? "todo" : "backlog",
    defaulted: true,
    reason: hasAssignee ? "assigned_omitted_status" : "unassigned_omitted_status"
  };
}
function withCreateIssueStatusDefault(schema) {
  return external_exports.preprocess((input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const raw = input;
    if (raw.status !== void 0) return input;
    return {
      ...raw,
      status: resolveCreateIssueStatusDefault(raw).status
    };
  }, schema);
}
var createIssueBaseSchema = external_exports.object({
  projectId: external_exports.string().uuid().optional().nullable(),
  projectWorkspaceId: external_exports.string().uuid().optional().nullable(),
  goalId: external_exports.string().uuid().optional().nullable(),
  parentId: external_exports.string().uuid().optional().nullable(),
  blockedByIssueIds: external_exports.array(external_exports.string().uuid()).optional(),
  inheritExecutionWorkspaceFromIssueId: external_exports.string().uuid().optional().nullable(),
  title: external_exports.string().min(1),
  description: multilineTextSchema.optional().nullable(),
  status: external_exports.enum(ISSUE_STATUSES),
  workMode: external_exports.enum(ISSUE_WORK_MODES).optional().default("standard"),
  harnessKind: external_exports.enum(ISSUE_HARNESS_KINDS).optional().nullable(),
  priority: external_exports.enum(ISSUE_PRIORITIES).optional().default("medium"),
  assigneeAgentId: external_exports.string().uuid().optional().nullable(),
  assigneeUserId: external_exports.string().optional().nullable(),
  requestDepth: issueRequestDepthInputSchema.optional().default(0),
  createdByUserId: external_exports.string().optional().nullable(),
  responsibleUserId: external_exports.string().optional().nullable(),
  billingCode: external_exports.string().optional().nullable(),
  assigneeAdapterOverrides: issueAssigneeAdapterOverridesSchema.optional().nullable(),
  executionPolicy: issueExecutionPolicySchema.optional().nullable(),
  executionWorkspaceId: external_exports.string().uuid().optional().nullable(),
  executionWorkspacePreference: external_exports.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional().nullable(),
  executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable(),
  labelIds: external_exports.array(external_exports.string().uuid()).optional(),
  watchdogDiscovery: external_exports.object({
    kind: external_exports.enum(ISSUE_WATCHDOG_DISCOVERY_KINDS),
    evidenceMarkdown: multilineTextSchema.optional().nullable()
  }).strict().optional().nullable(),
  watchdog: external_exports.object({
    agentId: external_exports.string().uuid(),
    instructions: multilineTextSchema.optional().nullable()
  }).strict().optional().nullable()
});
var createIssueInputSchema = createIssueBaseSchema.extend({
  status: createIssueBaseSchema.shape.status.optional()
});
var createIssueSchema = withCreateIssueStatusDefault(createIssueBaseSchema);
var upsertIssueWatchdogSchema = external_exports.object({
  agentId: external_exports.string().uuid(),
  instructions: multilineTextSchema.optional().nullable()
}).strict();
var createChildIssueSchema = withCreateIssueStatusDefault(createIssueBaseSchema.omit({
  parentId: true,
  inheritExecutionWorkspaceFromIssueId: true,
  watchdogDiscovery: true
}).extend({
  acceptanceCriteria: external_exports.array(external_exports.string().trim().min(1).max(500)).max(20).optional(),
  blockParentUntilDone: external_exports.boolean().optional().default(false)
}));
var createAcceptedPlanDecompositionSchema = external_exports.object({
  acceptedPlanRevisionId: external_exports.string().uuid(),
  children: external_exports.array(createChildIssueSchema).min(1).max(25)
});
var createIssueLabelSchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(48),
  color: external_exports.string().regex(/^#(?:[0-9a-fA-F]{6})$/, "Color must be a 6-digit hex value")
});
var updateIssueSchema = createIssueBaseSchema.omit({
  createdByUserId: true,
  responsibleUserId: true,
  watchdog: true
}).partial().extend({
  requestDepth: issueRequestDepthInputSchema.optional(),
  assigneeAgentId: external_exports.string().trim().min(1).optional().nullable(),
  comment: multilineTextSchema.pipe(external_exports.string().min(1)).optional(),
  reviewRequest: issueReviewRequestSchema.optional().nullable(),
  reopen: external_exports.boolean().optional(),
  resume: external_exports.boolean().optional(),
  interrupt: external_exports.boolean().optional(),
  hiddenAt: external_exports.string().datetime().nullable().optional()
});
var checkoutIssueSchema = external_exports.object({
  agentId: external_exports.string().uuid(),
  expectedStatuses: external_exports.array(external_exports.enum(ISSUE_STATUSES)).nonempty()
});
var commentMetadataLabelSchema = external_exports.string().trim().min(1).max(120);
var commentMetadataTextSchema = external_exports.string().trim().min(1).max(2e3);
var issueCommentAuthorTypeSchema = external_exports.enum(ISSUE_COMMENT_AUTHOR_TYPES);
var issueCommentPresentationSchema = external_exports.object({
  kind: external_exports.enum(ISSUE_COMMENT_PRESENTATION_KINDS).default("message"),
  tone: external_exports.enum(ISSUE_COMMENT_PRESENTATION_TONES).default("neutral"),
  title: external_exports.string().trim().min(1).max(160).nullable().optional(),
  detailsDefaultOpen: external_exports.boolean().optional().default(false)
}).strict();
var issueCommentMetadataBaseRowSchema = external_exports.object({
  type: external_exports.enum(ISSUE_COMMENT_METADATA_ROW_TYPES),
  label: commentMetadataLabelSchema.nullable().optional()
});
var issueCommentMetadataTextRowSchema = issueCommentMetadataBaseRowSchema.extend({
  type: external_exports.literal("text"),
  text: commentMetadataTextSchema
}).strict();
var issueCommentMetadataCodeRowSchema = issueCommentMetadataBaseRowSchema.extend({
  type: external_exports.literal("code"),
  code: external_exports.string().min(1).max(4e3),
  language: external_exports.string().trim().min(1).max(40).nullable().optional()
}).strict();
var issueCommentMetadataKeyValueRowSchema = issueCommentMetadataBaseRowSchema.extend({
  type: external_exports.literal("key_value"),
  label: commentMetadataLabelSchema,
  value: commentMetadataTextSchema
}).strict();
var issueCommentMetadataIssueLinkRowSchema = issueCommentMetadataBaseRowSchema.extend({
  type: external_exports.literal("issue_link"),
  issueId: external_exports.string().uuid().nullable().optional(),
  identifier: external_exports.string().trim().min(1).max(80).nullable().optional(),
  title: external_exports.string().trim().min(1).max(240).nullable().optional()
}).strict();
var issueCommentMetadataAgentLinkRowSchema = issueCommentMetadataBaseRowSchema.extend({
  type: external_exports.literal("agent_link"),
  agentId: external_exports.string().uuid(),
  name: external_exports.string().trim().min(1).max(160).nullable().optional()
}).strict();
var issueCommentMetadataRunLinkRowSchema = issueCommentMetadataBaseRowSchema.extend({
  type: external_exports.literal("run_link"),
  runId: external_exports.string().uuid(),
  title: external_exports.string().trim().min(1).max(160).nullable().optional()
}).strict();
var issueCommentMetadataRowSchema = external_exports.discriminatedUnion("type", [
  issueCommentMetadataTextRowSchema,
  issueCommentMetadataCodeRowSchema,
  issueCommentMetadataKeyValueRowSchema,
  issueCommentMetadataIssueLinkRowSchema,
  issueCommentMetadataAgentLinkRowSchema,
  issueCommentMetadataRunLinkRowSchema
]).superRefine((value, ctx) => {
  if (value.type === "issue_link" && !value.issueId && !value.identifier) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "Issue link rows require issueId or identifier",
      path: ["issueId"]
    });
  }
});
var issueCommentMetadataSectionSchema = external_exports.object({
  title: external_exports.string().trim().min(1).max(160).nullable().optional(),
  rows: external_exports.array(issueCommentMetadataRowSchema).min(1).max(50)
}).strict();
var issueCommentMetadataSchema = external_exports.object({
  version: external_exports.literal(1),
  sourceRunId: external_exports.string().uuid().nullable().optional(),
  sections: external_exports.array(issueCommentMetadataSectionSchema).min(1).max(20)
}).strict();
var addIssueCommentSchema = external_exports.object({
  body: multilineTextSchema.pipe(external_exports.string().min(1)),
  authorType: issueCommentAuthorTypeSchema.optional(),
  presentation: issueCommentPresentationSchema.nullable().optional(),
  metadata: issueCommentMetadataSchema.nullable().optional(),
  reopen: external_exports.boolean().optional(),
  resume: external_exports.boolean().optional(),
  interrupt: external_exports.boolean().optional()
});
var issueThreadInteractionStatusSchema = external_exports.enum(ISSUE_THREAD_INTERACTION_STATUSES);
var issueThreadInteractionKindSchema = external_exports.enum(ISSUE_THREAD_INTERACTION_KINDS);
var issueThreadInteractionContinuationPolicySchema = external_exports.enum(
  ISSUE_THREAD_INTERACTION_CONTINUATION_POLICIES
);
var issueDocumentKeySchema = external_exports.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, "Document key must be lowercase letters, numbers, _ or -");
var suggestedTaskDraftSchema = external_exports.object({
  clientKey: external_exports.string().trim().min(1).max(120),
  parentClientKey: external_exports.string().trim().min(1).max(120).nullable().optional(),
  parentId: external_exports.string().uuid().nullable().optional(),
  title: external_exports.string().trim().min(1).max(240),
  description: multilineTextSchema.pipe(external_exports.string().trim().max(2e4)).nullable().optional(),
  priority: external_exports.enum(ISSUE_PRIORITIES).nullable().optional(),
  workMode: external_exports.enum(ISSUE_WORK_MODES).nullable().optional(),
  assigneeAgentId: external_exports.string().uuid().nullable().optional(),
  assigneeUserId: external_exports.string().trim().min(1).nullable().optional(),
  projectId: external_exports.string().uuid().nullable().optional(),
  goalId: external_exports.string().uuid().nullable().optional(),
  billingCode: external_exports.string().trim().max(120).nullable().optional(),
  labels: external_exports.array(external_exports.string().trim().min(1).max(48)).max(20).optional(),
  hiddenInPreview: external_exports.boolean().optional()
}).superRefine((value, ctx) => {
  if (value.assigneeAgentId && value.assigneeUserId) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "Suggested tasks can only target one assignee",
      path: ["assigneeAgentId"]
    });
  }
});
var suggestTasksPayloadSchema = external_exports.object({
  version: external_exports.literal(1),
  defaultParentId: external_exports.string().uuid().nullable().optional(),
  tasks: external_exports.array(suggestedTaskDraftSchema).min(1).max(50)
}).superRefine((value, ctx) => {
  const seenClientKeys = /* @__PURE__ */ new Set();
  for (const [index, task] of value.tasks.entries()) {
    if (seenClientKeys.has(task.clientKey)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "clientKey must be unique within one interaction",
        path: ["tasks", index, "clientKey"]
      });
      continue;
    }
    seenClientKeys.add(task.clientKey);
  }
});
var suggestTasksResultCreatedTaskSchema = external_exports.object({
  clientKey: external_exports.string().trim().min(1).max(120),
  issueId: external_exports.string().uuid(),
  identifier: external_exports.string().trim().min(1).nullable().optional(),
  title: external_exports.string().trim().min(1).nullable().optional(),
  parentIssueId: external_exports.string().uuid().nullable().optional(),
  parentIdentifier: external_exports.string().trim().min(1).nullable().optional()
});
var suggestTasksResultSchema = external_exports.object({
  version: external_exports.literal(1),
  createdTasks: external_exports.array(suggestTasksResultCreatedTaskSchema).max(50).optional(),
  skippedClientKeys: external_exports.array(external_exports.string().trim().min(1).max(120)).max(50).optional(),
  rejectionReason: external_exports.string().trim().max(4e3).nullable().optional()
});
var askUserQuestionsQuestionOptionSchema = external_exports.object({
  id: external_exports.string().trim().min(1).max(120),
  label: external_exports.string().trim().min(1).max(120),
  description: external_exports.string().trim().max(500).nullable().optional()
});
var askUserQuestionsQuestionSchema = external_exports.object({
  id: external_exports.string().trim().min(1).max(120),
  prompt: external_exports.string().trim().min(1).max(500),
  helpText: external_exports.string().trim().max(1e3).nullable().optional(),
  selectionMode: external_exports.enum(["single", "multi"]),
  required: external_exports.boolean().optional(),
  options: external_exports.array(askUserQuestionsQuestionOptionSchema).min(1).max(10)
});
var askUserQuestionsPayloadSchema = external_exports.object({
  version: external_exports.literal(1),
  title: external_exports.string().trim().max(240).nullable().optional(),
  submitLabel: external_exports.string().trim().max(120).nullable().optional(),
  supersedeOnUserComment: external_exports.boolean().optional(),
  questions: external_exports.array(askUserQuestionsQuestionSchema).min(1).max(10)
}).superRefine((value, ctx) => {
  const seenQuestionIds = /* @__PURE__ */ new Set();
  for (const [questionIndex, question] of value.questions.entries()) {
    if (seenQuestionIds.has(question.id)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Question ids must be unique within one interaction",
        path: ["questions", questionIndex, "id"]
      });
    }
    seenQuestionIds.add(question.id);
    const seenOptionIds = /* @__PURE__ */ new Set();
    for (const [optionIndex, option] of question.options.entries()) {
      if (seenOptionIds.has(option.id)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: "Option ids must be unique within one question",
          path: ["questions", questionIndex, "options", optionIndex, "id"]
        });
      }
      seenOptionIds.add(option.id);
    }
  }
});
var askUserQuestionsAnswerSchema = external_exports.object({
  questionId: external_exports.string().trim().min(1).max(120),
  optionIds: external_exports.array(external_exports.string().trim().min(1).max(120)).max(20),
  otherText: multilineTextSchema.pipe(external_exports.string().trim().max(4e3)).nullable().optional()
});
var askUserQuestionsResultSchema = external_exports.object({
  version: external_exports.literal(1),
  answers: external_exports.array(askUserQuestionsAnswerSchema).max(20),
  cancelled: external_exports.literal(true).optional(),
  cancellationReason: external_exports.string().trim().max(4e3).nullable().optional(),
  expirationReason: external_exports.literal("superseded_by_comment").optional(),
  commentId: external_exports.string().uuid().nullable().optional(),
  summaryMarkdown: external_exports.string().max(2e4).nullable().optional()
});
var requestConfirmationHrefSchema = external_exports.string().trim().min(1).max(2e3).refine((value) => {
  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) return !value.startsWith("//");
  return /^https?:\/\//i.test(value);
}, "href must be a root-relative path, same-page fragment, or http(s) URL");
var requestConfirmationTargetBaseSchema = external_exports.object({
  label: external_exports.string().trim().min(1).max(120).nullable().optional(),
  href: requestConfirmationHrefSchema.nullable().optional()
});
var requestConfirmationIssueDocumentTargetSchema = requestConfirmationTargetBaseSchema.extend({
  type: external_exports.literal("issue_document"),
  issueId: external_exports.string().uuid().nullable().optional(),
  documentId: external_exports.string().uuid().nullable().optional(),
  key: issueDocumentKeySchema,
  revisionId: external_exports.string().uuid(),
  revisionNumber: external_exports.number().int().positive().nullable().optional()
});
var requestConfirmationCustomTargetSchema = requestConfirmationTargetBaseSchema.extend({
  type: external_exports.literal("custom"),
  key: external_exports.string().trim().min(1).max(120),
  revisionId: external_exports.string().trim().min(1).max(255).nullable().optional(),
  revisionNumber: external_exports.number().int().positive().nullable().optional()
});
var requestConfirmationTargetSchema = external_exports.discriminatedUnion("type", [
  requestConfirmationIssueDocumentTargetSchema,
  requestConfirmationCustomTargetSchema
]);
var requestConfirmationPayloadSchema = external_exports.object({
  version: external_exports.literal(1),
  prompt: external_exports.string().trim().min(1).max(1e3),
  acceptLabel: external_exports.string().trim().min(1).max(80).nullable().optional(),
  rejectLabel: external_exports.string().trim().min(1).max(80).nullable().optional(),
  rejectRequiresReason: external_exports.boolean().optional(),
  rejectReasonLabel: external_exports.string().trim().min(1).max(160).nullable().optional(),
  allowDeclineReason: external_exports.boolean().optional().default(true),
  declineReasonPlaceholder: external_exports.string().trim().min(1).max(240).nullable().optional(),
  detailsMarkdown: external_exports.string().max(2e4).nullable().optional(),
  supersedeOnUserComment: external_exports.boolean().optional(),
  target: requestConfirmationTargetSchema.nullable().optional()
});
var requestCheckboxConfirmationOptionSchema = external_exports.object({
  id: external_exports.string().trim().min(1).max(120),
  label: external_exports.string().trim().min(1).max(120),
  description: external_exports.string().trim().max(500).nullable().optional()
});
var requestCheckboxConfirmationPayloadSchema = external_exports.object({
  version: external_exports.literal(1),
  prompt: external_exports.string().trim().min(1).max(1e3),
  detailsMarkdown: external_exports.string().max(2e4).nullable().optional(),
  options: external_exports.array(requestCheckboxConfirmationOptionSchema).min(1).max(REQUEST_CHECKBOX_CONFIRMATION_OPTION_LIMIT),
  defaultSelectedOptionIds: external_exports.array(external_exports.string().trim().min(1).max(120)).max(REQUEST_CHECKBOX_CONFIRMATION_OPTION_LIMIT).optional().default([]),
  minSelected: external_exports.number().int().min(0).optional().default(0),
  maxSelected: external_exports.number().int().min(0).nullable().optional(),
  acceptLabel: external_exports.string().trim().min(1).max(80).nullable().optional(),
  rejectLabel: external_exports.string().trim().min(1).max(80).nullable().optional(),
  rejectRequiresReason: external_exports.boolean().optional(),
  rejectReasonLabel: external_exports.string().trim().min(1).max(160).nullable().optional(),
  allowDeclineReason: external_exports.boolean().optional().default(true),
  declineReasonPlaceholder: external_exports.string().trim().min(1).max(240).nullable().optional(),
  supersedeOnUserComment: external_exports.boolean().optional(),
  target: requestConfirmationTargetSchema.nullable().optional()
}).superRefine((value, ctx) => {
  const optionIds = /* @__PURE__ */ new Set();
  for (const [index, option] of value.options.entries()) {
    if (optionIds.has(option.id)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Option ids must be unique within one checkbox confirmation",
        path: ["options", index, "id"]
      });
    }
    optionIds.add(option.id);
  }
  const defaultSelectedOptionIds = /* @__PURE__ */ new Set();
  for (const [index, optionId] of value.defaultSelectedOptionIds.entries()) {
    if (defaultSelectedOptionIds.has(optionId)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "defaultSelectedOptionIds must be unique",
        path: ["defaultSelectedOptionIds", index]
      });
      continue;
    }
    defaultSelectedOptionIds.add(optionId);
    if (!optionIds.has(optionId)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "defaultSelectedOptionIds must reference existing option ids",
        path: ["defaultSelectedOptionIds", index]
      });
    }
  }
  const maxSelected = value.maxSelected ?? null;
  if (value.minSelected > value.options.length) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "minSelected cannot exceed the option count",
      path: ["minSelected"]
    });
  }
  if (value.defaultSelectedOptionIds.length < value.minSelected) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "defaultSelectedOptionIds must satisfy minSelected",
      path: ["defaultSelectedOptionIds"]
    });
  }
  if (maxSelected != null) {
    if (maxSelected < value.minSelected) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "maxSelected must be greater than or equal to minSelected",
        path: ["maxSelected"]
      });
    }
    if (maxSelected > value.options.length) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "maxSelected cannot exceed the option count",
        path: ["maxSelected"]
      });
    }
    if (value.defaultSelectedOptionIds.length > maxSelected) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "defaultSelectedOptionIds cannot exceed maxSelected",
        path: ["defaultSelectedOptionIds"]
      });
    }
  }
});
var requestConfirmationResumeFailureSchema = external_exports.object({
  status: external_exports.enum(["retrying", "needs_attention"]),
  errorCode: external_exports.string().trim().min(1).max(120).nullable(),
  attempt: external_exports.number().int().min(0).max(100),
  maxAttempts: external_exports.number().int().min(0).max(100),
  runId: external_exports.string().uuid().nullable().optional(),
  retryRunId: external_exports.string().uuid().nullable().optional(),
  recoveryActionId: external_exports.string().uuid().nullable().optional(),
  updatedAt: external_exports.string().trim().min(1).nullable().optional()
});
var requestConfirmationResultSchema = external_exports.object({
  version: external_exports.literal(1),
  outcome: external_exports.enum(["accepted", "rejected", "superseded_by_comment", "stale_target"]),
  reason: external_exports.string().trim().max(4e3).nullable().optional(),
  commentId: external_exports.string().uuid().nullable().optional(),
  staleTarget: requestConfirmationTargetSchema.nullable().optional(),
  resumeFailure: requestConfirmationResumeFailureSchema.nullable().optional()
});
var requestCheckboxConfirmationResultSchema = requestConfirmationResultSchema.extend({
  selectedOptionIds: external_exports.array(external_exports.string().trim().min(1).max(120)).max(REQUEST_CHECKBOX_CONFIRMATION_OPTION_LIMIT).optional()
}).superRefine((value, ctx) => {
  const selectedOptionIds = value.selectedOptionIds ?? [];
  const seenOptionIds = /* @__PURE__ */ new Set();
  for (const [index, optionId] of selectedOptionIds.entries()) {
    if (seenOptionIds.has(optionId)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "selectedOptionIds must be unique",
        path: ["selectedOptionIds", index]
      });
    }
    seenOptionIds.add(optionId);
  }
});
var requestItemVerdictValueSchema = external_exports.enum(["approve", "reject", "defer"]);
var requestItemVerdictsItemSchema = external_exports.object({
  id: external_exports.string().trim().min(1).max(120),
  label: external_exports.string().trim().min(1).max(120),
  description: external_exports.string().trim().max(500).nullable().optional(),
  previewMarkdown: external_exports.string().max(2e4).nullable().optional(),
  href: requestConfirmationHrefSchema.nullable().optional(),
  attachmentId: external_exports.string().uuid().nullable().optional()
});
var requestItemVerdictsPayloadSchema = external_exports.object({
  version: external_exports.literal(1),
  prompt: external_exports.string().trim().min(1).max(1e3),
  detailsMarkdown: external_exports.string().max(2e4).nullable().optional(),
  items: external_exports.array(requestItemVerdictsItemSchema).min(1).max(REQUEST_ITEM_VERDICTS_ITEM_LIMIT),
  verdicts: external_exports.array(requestItemVerdictValueSchema).min(2).max(3).optional().default(["approve", "reject"]),
  requireReasonOn: external_exports.array(requestItemVerdictValueSchema).max(3).optional().default(["reject"]),
  reasonLabel: external_exports.string().trim().min(1).max(160).nullable().optional(),
  allowBulkApprove: external_exports.boolean().optional().default(true),
  supersedeOnUserComment: external_exports.boolean().optional(),
  target: requestConfirmationTargetSchema.nullable().optional()
}).superRefine((value, ctx) => {
  const itemIds = /* @__PURE__ */ new Set();
  for (const [index, item] of value.items.entries()) {
    if (itemIds.has(item.id)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Item ids must be unique within one item verdict request",
        path: ["items", index, "id"]
      });
    }
    itemIds.add(item.id);
  }
  const verdicts = /* @__PURE__ */ new Set();
  for (const [index, verdict] of value.verdicts.entries()) {
    if (verdicts.has(verdict)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "verdicts must be unique",
        path: ["verdicts", index]
      });
    }
    verdicts.add(verdict);
  }
  if (!verdicts.has("approve") || !verdicts.has("reject")) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "verdicts must include approve and reject; defer is optional",
      path: ["verdicts"]
    });
  }
  const reasonVerdicts = /* @__PURE__ */ new Set();
  for (const [index, verdict] of value.requireReasonOn.entries()) {
    if (reasonVerdicts.has(verdict)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "requireReasonOn must be unique",
        path: ["requireReasonOn", index]
      });
      continue;
    }
    reasonVerdicts.add(verdict);
    if (!verdicts.has(verdict)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "requireReasonOn must reference enabled verdicts",
        path: ["requireReasonOn", index]
      });
    }
  }
});
var requestItemVerdictsResultItemSchema = external_exports.object({
  id: external_exports.string().trim().min(1).max(120),
  verdict: requestItemVerdictValueSchema,
  reason: external_exports.string().trim().max(4e3).nullable().optional(),
  resolvedByUserId: external_exports.string().trim().min(1).max(255),
  resolvedAt: external_exports.union([external_exports.string().datetime(), external_exports.date()]),
  commentId: external_exports.string().uuid().nullable().optional()
});
var requestItemVerdictsResultSchema = external_exports.object({
  version: external_exports.literal(1),
  outcome: external_exports.enum(["resolved", "superseded_by_comment", "stale_target", "cancelled"]),
  complete: external_exports.boolean(),
  items: external_exports.array(requestItemVerdictsResultItemSchema).max(REQUEST_ITEM_VERDICTS_ITEM_LIMIT),
  commentId: external_exports.string().uuid().nullable().optional(),
  staleTarget: requestConfirmationTargetSchema.nullable().optional()
}).superRefine((value, ctx) => {
  const itemIds = /* @__PURE__ */ new Set();
  for (const [index, item] of value.items.entries()) {
    if (itemIds.has(item.id)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "result item ids must be unique",
        path: ["items", index, "id"]
      });
    }
    itemIds.add(item.id);
  }
});
var createIssueThreadInteractionSchema = external_exports.discriminatedUnion("kind", [
  external_exports.object({
    kind: external_exports.literal("suggest_tasks"),
    idempotencyKey: external_exports.string().trim().max(255).nullable().optional(),
    sourceCommentId: external_exports.string().uuid().nullable().optional(),
    sourceRunId: external_exports.string().uuid().nullable().optional(),
    title: external_exports.string().trim().max(240).nullable().optional(),
    summary: external_exports.string().trim().max(1e3).nullable().optional(),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
    payload: suggestTasksPayloadSchema
  }),
  external_exports.object({
    kind: external_exports.literal("ask_user_questions"),
    idempotencyKey: external_exports.string().trim().max(255).nullable().optional(),
    sourceCommentId: external_exports.string().uuid().nullable().optional(),
    sourceRunId: external_exports.string().uuid().nullable().optional(),
    title: external_exports.string().trim().max(240).nullable().optional(),
    summary: external_exports.string().trim().max(1e3).nullable().optional(),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
    payload: askUserQuestionsPayloadSchema
  }),
  external_exports.object({
    kind: external_exports.literal("request_confirmation"),
    idempotencyKey: external_exports.string().trim().max(255).nullable().optional(),
    sourceCommentId: external_exports.string().uuid().nullable().optional(),
    sourceRunId: external_exports.string().uuid().nullable().optional(),
    title: external_exports.string().trim().max(240).nullable().optional(),
    summary: external_exports.string().trim().max(1e3).nullable().optional(),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("none"),
    payload: requestConfirmationPayloadSchema
  }),
  external_exports.object({
    kind: external_exports.literal("request_checkbox_confirmation"),
    idempotencyKey: external_exports.string().trim().max(255).nullable().optional(),
    sourceCommentId: external_exports.string().uuid().nullable().optional(),
    sourceRunId: external_exports.string().uuid().nullable().optional(),
    title: external_exports.string().trim().max(240).nullable().optional(),
    summary: external_exports.string().trim().max(1e3).nullable().optional(),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
    payload: requestCheckboxConfirmationPayloadSchema
  }),
  external_exports.object({
    kind: external_exports.literal("request_item_verdicts"),
    idempotencyKey: external_exports.string().trim().max(255).nullable().optional(),
    sourceCommentId: external_exports.string().uuid().nullable().optional(),
    sourceRunId: external_exports.string().uuid().nullable().optional(),
    title: external_exports.string().trim().max(240).nullable().optional(),
    summary: external_exports.string().trim().max(1e3).nullable().optional(),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
    payload: requestItemVerdictsPayloadSchema
  })
]);
var acceptIssueThreadInteractionSchema = external_exports.object({
  selectedClientKeys: external_exports.array(external_exports.string().trim().min(1).max(120)).min(1).max(50).optional(),
  selectedOptionIds: external_exports.array(external_exports.string().trim().min(1).max(120)).max(REQUEST_CHECKBOX_CONFIRMATION_OPTION_LIMIT).optional()
}).superRefine((value, ctx) => {
  const seenClientKeys = /* @__PURE__ */ new Set();
  for (const [index, clientKey] of (value.selectedClientKeys ?? []).entries()) {
    if (seenClientKeys.has(clientKey)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "selectedClientKeys must be unique",
        path: ["selectedClientKeys", index]
      });
      continue;
    }
    seenClientKeys.add(clientKey);
  }
  const seenOptionIds = /* @__PURE__ */ new Set();
  for (const [index, optionId] of (value.selectedOptionIds ?? []).entries()) {
    if (seenOptionIds.has(optionId)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "selectedOptionIds must be unique",
        path: ["selectedOptionIds", index]
      });
      continue;
    }
    seenOptionIds.add(optionId);
  }
});
var rejectIssueThreadInteractionSchema = external_exports.object({
  reason: external_exports.string().trim().max(4e3).optional()
});
var cancelIssueThreadInteractionSchema = external_exports.object({
  reason: external_exports.string().trim().max(4e3).optional()
});
var respondIssueThreadInteractionSchema = external_exports.object({
  answers: external_exports.array(askUserQuestionsAnswerSchema).max(20),
  summaryMarkdown: multilineTextSchema.pipe(external_exports.string().max(2e4)).nullable().optional()
});
var submitIssueThreadInteractionVerdictsSchema = external_exports.object({
  verdicts: external_exports.array(external_exports.object({
    id: external_exports.string().trim().min(1).max(120),
    verdict: requestItemVerdictValueSchema,
    reason: external_exports.string().trim().max(4e3).nullable().optional()
  })).min(1).max(REQUEST_ITEM_VERDICTS_ITEM_LIMIT)
}).superRefine((value, ctx) => {
  const itemIds = /* @__PURE__ */ new Set();
  for (const [index, verdict] of value.verdicts.entries()) {
    if (itemIds.has(verdict.id)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "verdict item ids must be unique",
        path: ["verdicts", index, "id"]
      });
    }
    itemIds.add(verdict.id);
  }
});
var linkIssueApprovalSchema = external_exports.object({
  approvalId: external_exports.string().uuid()
});
var createIssueAttachmentMetadataSchema = external_exports.object({
  issueCommentId: external_exports.string().uuid().optional().nullable()
});
var ISSUE_DOCUMENT_FORMATS = ["markdown"];
var issueDocumentFormatSchema = external_exports.enum(ISSUE_DOCUMENT_FORMATS);
var upsertIssueDocumentSchema = external_exports.object({
  title: external_exports.string().trim().max(200).nullable().optional(),
  format: issueDocumentFormatSchema,
  body: multilineTextSchema.pipe(external_exports.string().max(524288)),
  changeSummary: external_exports.string().trim().max(500).nullable().optional(),
  baseRevisionId: external_exports.string().uuid().nullable().optional()
});
var restoreIssueDocumentRevisionSchema = external_exports.object({});
function validateIssueReportBody(body, kind) {
  if (typeof body !== "string") {
    return { valid: false, error: "Report body must be a string" };
  }
  const lines = body.split(/\r?\n/);
  const expectedHeader = kind === "final" ? "## Paperclip Final Report" : "## Paperclip Blocker Report";
  if (lines[0] !== expectedHeader) {
    return {
      valid: false,
      error: `First line must be exactly "${expectedHeader}"`
    };
  }
  const contentLines = lines.slice(1).map((line) => line.trim()).filter((line) => line.length > 0);
  if (contentLines.length === 0) {
    return {
      valid: false,
      error: "Report body must contain content after the header"
    };
  }
  const substantiveText = contentLines.join("").replace(/[^\p{L}\p{N}]/gu, "");
  if (substantiveText.length < 8) {
    return {
      valid: false,
      error: "Report body is too short or trivial"
    };
  }
  return { valid: true };
}
var submitIssueReportSchema = external_exports.object({
  kind: external_exports.enum(["final", "blocker"]),
  body: multilineTextSchema.pipe(external_exports.string().min(1))
}).superRefine((value, ctx) => {
  const result = validateIssueReportBody(value.body, value.kind);
  if (!result.valid) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: result.error || "Invalid report body",
      path: ["body"]
    });
  }
});

// ../../external/sps-core/packages/shared/src/routine-variables.ts
var HUMAN_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
  timeZoneName: "short"
});
function isValidRoutineDateString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ][month - 1];
  return day >= 1 && day <= daysInMonth;
}

// ../../external/sps-core/packages/shared/src/validators/routine.ts
var routineVariableValueSchema = external_exports.union([external_exports.string(), external_exports.number().finite(), external_exports.boolean()]);
var routineVariableSchema = external_exports.object({
  name: external_exports.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: external_exports.string().trim().max(120).optional().nullable(),
  type: external_exports.enum(ROUTINE_VARIABLE_TYPES).optional().default("text"),
  defaultValue: routineVariableValueSchema.optional().nullable(),
  required: external_exports.boolean().optional().default(true),
  options: external_exports.array(external_exports.string().trim().min(1).max(120)).max(50).optional().default([])
}).superRefine((value, ctx) => {
  if (value.type === "select" && value.options.length === 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["options"],
      message: "Select variables require at least one option"
    });
  }
  if (value.type !== "select" && value.options.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["options"],
      message: "Only select variables can define options"
    });
  }
  if (value.type === "select" && value.defaultValue != null) {
    if (typeof value.defaultValue !== "string" || !value.options.includes(value.defaultValue)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["defaultValue"],
        message: "Select variable defaults must match one of the allowed options"
      });
    }
  }
  if (value.type === "date" && value.defaultValue != null) {
    if (typeof value.defaultValue !== "string" || !isValidRoutineDateString(value.defaultValue)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["defaultValue"],
        message: "Date variable defaults must be valid YYYY-MM-DD calendar dates"
      });
    }
  }
});
var createRoutineSchema = external_exports.object({
  projectId: external_exports.string().uuid().optional().nullable(),
  goalId: external_exports.string().uuid().optional().nullable(),
  parentIssueId: external_exports.string().uuid().optional().nullable(),
  title: external_exports.string().trim().min(1).max(200),
  description: external_exports.string().optional().nullable(),
  assigneeAgentId: external_exports.string().uuid().optional().nullable(),
  priority: external_exports.enum(ISSUE_PRIORITIES).optional().default("medium"),
  status: external_exports.enum(ROUTINE_STATUSES).optional().default("active"),
  concurrencyPolicy: external_exports.enum(ROUTINE_CONCURRENCY_POLICIES).optional().default("coalesce_if_active"),
  catchUpPolicy: external_exports.enum(ROUTINE_CATCH_UP_POLICIES).optional().default("skip_missed"),
  variables: external_exports.array(routineVariableSchema).optional().default([]),
  env: envConfigSchema.optional().nullable()
});
var updateRoutineSchema = createRoutineSchema.partial().extend({
  baseRevisionId: external_exports.string().uuid().optional().nullable()
});
var routineRevisionSnapshotRoutineV1Schema = external_exports.object({
  id: external_exports.string().uuid(),
  companyId: external_exports.string().uuid(),
  projectId: external_exports.string().uuid().nullable(),
  goalId: external_exports.string().uuid().nullable(),
  parentIssueId: external_exports.string().uuid().nullable(),
  title: external_exports.string().trim().min(1).max(200),
  description: external_exports.string().nullable(),
  assigneeAgentId: external_exports.string().uuid().nullable(),
  priority: external_exports.enum(ISSUE_PRIORITIES),
  status: external_exports.enum(ROUTINE_STATUSES),
  concurrencyPolicy: external_exports.enum(ROUTINE_CONCURRENCY_POLICIES),
  catchUpPolicy: external_exports.enum(ROUTINE_CATCH_UP_POLICIES),
  variables: external_exports.array(routineVariableSchema),
  env: envConfigSchema.nullable().default(null),
  responsibleUserId: external_exports.string().nullable().default(null)
}).strict();
var routineRevisionSnapshotTriggerV1Schema = external_exports.object({
  id: external_exports.string().uuid(),
  kind: external_exports.enum(ROUTINE_TRIGGER_KINDS),
  label: external_exports.string().nullable(),
  enabled: external_exports.boolean(),
  cronExpression: external_exports.string().nullable(),
  timezone: external_exports.string().nullable(),
  publicId: external_exports.string().nullable(),
  signingMode: external_exports.enum(ROUTINE_TRIGGER_SIGNING_MODES).nullable(),
  replayWindowSec: external_exports.number().int().min(30).max(86400).nullable()
}).strict();
var routineRevisionSnapshotV1Schema = external_exports.object({
  version: external_exports.literal(1),
  routine: routineRevisionSnapshotRoutineV1Schema,
  triggers: external_exports.array(routineRevisionSnapshotTriggerV1Schema)
}).strict();
var baseTriggerSchema = external_exports.object({
  label: external_exports.string().trim().max(120).optional().nullable(),
  enabled: external_exports.boolean().optional().default(true)
});
var createRoutineTriggerSchema = external_exports.discriminatedUnion("kind", [
  baseTriggerSchema.extend({
    kind: external_exports.literal("schedule"),
    cronExpression: external_exports.string().trim().min(1),
    timezone: external_exports.string().trim().min(1).default("UTC")
  }),
  baseTriggerSchema.extend({
    kind: external_exports.literal("webhook"),
    signingMode: external_exports.enum(ROUTINE_TRIGGER_SIGNING_MODES).optional().default("bearer"),
    replayWindowSec: external_exports.number().int().min(30).max(86400).optional().default(300)
  }),
  baseTriggerSchema.extend({
    kind: external_exports.literal("api")
  })
]);
var updateRoutineTriggerSchema = external_exports.object({
  label: external_exports.string().trim().max(120).optional().nullable(),
  enabled: external_exports.boolean().optional(),
  cronExpression: external_exports.string().trim().min(1).optional().nullable(),
  timezone: external_exports.string().trim().min(1).optional().nullable(),
  signingMode: external_exports.enum(ROUTINE_TRIGGER_SIGNING_MODES).optional().nullable(),
  replayWindowSec: external_exports.number().int().min(30).max(86400).optional().nullable()
});
var runRoutineSchema = external_exports.object({
  triggerId: external_exports.string().uuid().optional().nullable(),
  payload: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  variables: external_exports.record(external_exports.string(), routineVariableValueSchema).optional().nullable(),
  projectId: external_exports.string().uuid().optional().nullable(),
  projectWorkspaceId: external_exports.string().uuid().optional().nullable(),
  assigneeAgentId: external_exports.string().uuid().optional().nullable(),
  idempotencyKey: external_exports.string().trim().max(255).optional().nullable(),
  source: external_exports.enum(["manual", "api"]).optional().default("manual"),
  executionWorkspaceId: external_exports.string().uuid().optional().nullable(),
  executionWorkspacePreference: external_exports.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional().nullable(),
  executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable()
});
var rotateRoutineTriggerSecretSchema = external_exports.object({});

// ../../external/sps-core/packages/shared/src/validators/company-portability.ts
var portabilityIncludeSchema = external_exports.object({
  company: external_exports.boolean().optional(),
  agents: external_exports.boolean().optional(),
  projects: external_exports.boolean().optional(),
  issues: external_exports.boolean().optional(),
  skills: external_exports.boolean().optional()
}).partial();
var portabilityEnvInputSchema = external_exports.object({
  key: external_exports.string().min(1),
  description: external_exports.string().nullable(),
  agentSlug: external_exports.string().min(1).nullable(),
  projectSlug: external_exports.string().min(1).nullable(),
  kind: external_exports.enum(["secret", "plain"]),
  requirement: external_exports.enum(["required", "optional"]),
  defaultValue: external_exports.string().nullable(),
  portability: external_exports.enum(["portable", "system_dependent"])
});
var portabilityFileEntrySchema = external_exports.union([
  external_exports.string(),
  external_exports.object({
    encoding: external_exports.literal("base64"),
    data: external_exports.string(),
    contentType: external_exports.string().min(1).optional().nullable()
  })
]);
var portabilityCompanyManifestEntrySchema = external_exports.object({
  path: external_exports.string().min(1),
  name: external_exports.string().min(1),
  description: external_exports.string().nullable(),
  brandColor: external_exports.string().nullable(),
  logoPath: external_exports.string().nullable(),
  attachmentMaxBytes: external_exports.number().int().min(1).max(MAX_COMPANY_ATTACHMENT_MAX_BYTES).nullable().default(null),
  requireBoardApprovalForNewAgents: external_exports.boolean(),
  feedbackDataSharingEnabled: external_exports.boolean().default(false),
  feedbackDataSharingConsentAt: external_exports.string().datetime().nullable().default(null),
  feedbackDataSharingConsentByUserId: external_exports.string().nullable().default(null),
  feedbackDataSharingTermsVersion: external_exports.string().nullable().default(null)
});
var portabilitySidebarOrderSchema = external_exports.object({
  agents: external_exports.array(external_exports.string().min(1)).default([]),
  projects: external_exports.array(external_exports.string().min(1)).default([])
});
var portabilityAgentManifestEntrySchema = external_exports.object({
  slug: external_exports.string().min(1),
  name: external_exports.string().min(1),
  path: external_exports.string().min(1),
  skills: external_exports.array(external_exports.string().min(1)).default([]),
  role: external_exports.string().min(1),
  title: external_exports.string().nullable(),
  icon: external_exports.string().nullable(),
  capabilities: external_exports.string().nullable(),
  reportsToSlug: external_exports.string().min(1).nullable(),
  adapterType: external_exports.string().min(1),
  adapterConfig: external_exports.record(external_exports.string(), external_exports.unknown()),
  runtimeConfig: external_exports.record(external_exports.string(), external_exports.unknown()),
  permissions: external_exports.record(external_exports.string(), external_exports.unknown()),
  permissionGrants: external_exports.array(external_exports.object({
    permissionKey: external_exports.enum(PERMISSION_KEYS),
    scope: external_exports.record(external_exports.string(), external_exports.unknown()).nullable().default(null)
  })).default([]),
  budgetMonthlyCents: external_exports.number().int().nonnegative(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).nullable()
});
var portabilitySkillManifestEntrySchema = external_exports.object({
  key: external_exports.string().min(1),
  slug: external_exports.string().min(1),
  name: external_exports.string().min(1),
  path: external_exports.string().min(1),
  description: external_exports.string().nullable(),
  sourceType: external_exports.string().min(1),
  sourceLocator: external_exports.string().nullable(),
  sourceRef: external_exports.string().nullable(),
  trustLevel: external_exports.string().nullable(),
  compatibility: external_exports.string().nullable(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  fileInventory: external_exports.array(external_exports.object({
    path: external_exports.string().min(1),
    kind: external_exports.string().min(1)
  })).default([])
});
var portabilityProjectManifestEntrySchema = external_exports.object({
  slug: external_exports.string().min(1),
  name: external_exports.string().min(1),
  path: external_exports.string().min(1),
  description: external_exports.string().nullable(),
  ownerAgentSlug: external_exports.string().min(1).nullable(),
  leadAgentSlug: external_exports.string().min(1).nullable(),
  targetDate: external_exports.string().nullable(),
  color: external_exports.string().nullable(),
  status: external_exports.string().nullable(),
  executionWorkspacePolicy: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  workspaces: external_exports.array(external_exports.object({
    key: external_exports.string().min(1),
    name: external_exports.string().min(1),
    sourceType: external_exports.string().nullable(),
    repoUrl: external_exports.string().nullable(),
    repoRef: external_exports.string().nullable(),
    defaultRef: external_exports.string().nullable(),
    visibility: external_exports.string().nullable(),
    setupCommand: external_exports.string().nullable(),
    cleanupCommand: external_exports.string().nullable(),
    metadata: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
    isPrimary: external_exports.boolean()
  })).default([]),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).nullable()
});
var portabilityIssueRoutineTriggerManifestEntrySchema = external_exports.object({
  kind: external_exports.string().min(1),
  label: external_exports.string().nullable(),
  enabled: external_exports.boolean(),
  cronExpression: external_exports.string().nullable(),
  timezone: external_exports.string().nullable(),
  signingMode: external_exports.string().nullable(),
  replayWindowSec: external_exports.number().int().nullable()
});
var portabilityIssueRoutineManifestEntrySchema = external_exports.object({
  concurrencyPolicy: external_exports.string().nullable(),
  catchUpPolicy: external_exports.string().nullable(),
  variables: external_exports.array(routineVariableSchema).nullable().optional(),
  triggers: external_exports.array(portabilityIssueRoutineTriggerManifestEntrySchema).default([])
});
var portabilityIssueCommentManifestEntrySchema = external_exports.object({
  body: external_exports.string().min(1),
  authorType: issueCommentAuthorTypeSchema,
  authorAgentSlug: external_exports.string().min(1).nullable(),
  authorUserId: external_exports.string().nullable(),
  presentation: issueCommentPresentationSchema.nullable(),
  metadata: issueCommentMetadataSchema.nullable(),
  createdAt: external_exports.string().datetime().nullable()
});
var portabilityIssueManifestEntrySchema = external_exports.object({
  slug: external_exports.string().min(1),
  identifier: external_exports.string().min(1).nullable(),
  title: external_exports.string().min(1),
  path: external_exports.string().min(1),
  projectSlug: external_exports.string().min(1).nullable(),
  projectWorkspaceKey: external_exports.string().min(1).nullable(),
  assigneeAgentSlug: external_exports.string().min(1).nullable(),
  description: external_exports.string().nullable(),
  recurring: external_exports.boolean().default(false),
  routine: portabilityIssueRoutineManifestEntrySchema.nullable(),
  legacyRecurrence: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  status: external_exports.string().nullable(),
  priority: external_exports.string().nullable(),
  labelIds: external_exports.array(external_exports.string().min(1)).default([]),
  billingCode: external_exports.string().nullable(),
  executionWorkspaceSettings: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  assigneeAdapterOverrides: external_exports.record(external_exports.string(), external_exports.unknown()).nullable(),
  comments: external_exports.array(portabilityIssueCommentManifestEntrySchema).default([]),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).nullable()
});
var portabilityManifestSchema = external_exports.object({
  schemaVersion: external_exports.number().int().positive(),
  generatedAt: external_exports.string().datetime(),
  source: external_exports.object({
    companyId: external_exports.string().uuid(),
    companyName: external_exports.string().min(1)
  }).nullable(),
  includes: external_exports.object({
    company: external_exports.boolean(),
    agents: external_exports.boolean(),
    projects: external_exports.boolean(),
    issues: external_exports.boolean(),
    skills: external_exports.boolean()
  }),
  company: portabilityCompanyManifestEntrySchema.nullable(),
  sidebar: portabilitySidebarOrderSchema.nullable(),
  agents: external_exports.array(portabilityAgentManifestEntrySchema),
  skills: external_exports.array(portabilitySkillManifestEntrySchema).default([]),
  projects: external_exports.array(portabilityProjectManifestEntrySchema).default([]),
  issues: external_exports.array(portabilityIssueManifestEntrySchema).default([]),
  envInputs: external_exports.array(portabilityEnvInputSchema).default([])
});
var portabilitySourceSchema = external_exports.discriminatedUnion("type", [
  external_exports.object({
    type: external_exports.literal("inline"),
    rootPath: external_exports.string().min(1).optional().nullable(),
    files: external_exports.record(external_exports.string(), portabilityFileEntrySchema)
  }),
  external_exports.object({
    type: external_exports.literal("github"),
    url: external_exports.string().url()
  })
]);
var portabilityTargetSchema = external_exports.discriminatedUnion("mode", [
  external_exports.object({
    mode: external_exports.literal("new_company"),
    newCompanyName: external_exports.string().min(1).optional().nullable()
  }),
  external_exports.object({
    mode: external_exports.literal("existing_company"),
    companyId: external_exports.string().uuid()
  })
]);
var portabilityAgentSelectionSchema = external_exports.union([
  external_exports.literal("all"),
  external_exports.array(external_exports.string().min(1))
]);
var portabilityCollisionStrategySchema = external_exports.enum(["rename", "skip", "replace"]);
var companyPortabilityExportSchema = external_exports.object({
  include: portabilityIncludeSchema.optional(),
  agents: external_exports.array(external_exports.string().min(1)).optional(),
  skills: external_exports.array(external_exports.string().min(1)).optional(),
  projects: external_exports.array(external_exports.string().min(1)).optional(),
  issues: external_exports.array(external_exports.string().min(1)).optional(),
  projectIssues: external_exports.array(external_exports.string().min(1)).optional(),
  selectedFiles: external_exports.array(external_exports.string().min(1)).optional(),
  expandReferencedSkills: external_exports.boolean().optional(),
  sidebarOrder: portabilitySidebarOrderSchema.partial().optional()
});
var companyPortabilityPreviewSchema = external_exports.object({
  source: portabilitySourceSchema,
  include: portabilityIncludeSchema.optional(),
  target: portabilityTargetSchema,
  agents: portabilityAgentSelectionSchema.optional(),
  collisionStrategy: portabilityCollisionStrategySchema.optional(),
  nameOverrides: external_exports.record(external_exports.string().min(1), external_exports.string().min(1)).optional(),
  selectedFiles: external_exports.array(external_exports.string().min(1)).optional()
});
var portabilityAdapterOverrideSchema = external_exports.object({
  adapterType: external_exports.string().min(1),
  adapterConfig: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
});
var companyPortabilityImportSchema = companyPortabilityPreviewSchema.extend({
  adapterOverrides: external_exports.record(external_exports.string().min(1), portabilityAdapterOverrideSchema).optional(),
  secretValues: external_exports.record(external_exports.string().min(1), external_exports.string()).optional()
});

// ../../external/sps-core/packages/shared/src/validators/teams-catalog.ts
var catalogTeamKindSchema = external_exports.enum(["bundled", "optional"]);
var catalogTeamTrustLevelSchema = external_exports.enum([
  "markdown_only",
  "assets",
  "scripts_executables",
  "external_sources"
]);
var catalogTeamCompatibilitySchema = external_exports.enum(["compatible", "unknown", "invalid"]);
var catalogTeamFileKindSchema = external_exports.enum([
  "team",
  "agent",
  "project",
  "task",
  "skill",
  "extension",
  "readme",
  "reference",
  "script",
  "asset",
  "markdown",
  "other"
]);
var catalogTeamSkillRequirementTypeSchema = external_exports.enum([
  "catalog",
  "local",
  "skills_sh",
  "github",
  "url",
  "local_path",
  "agent_package"
]);
var catalogTeamSkillRequirementSchema = external_exports.object({
  type: catalogTeamSkillRequirementTypeSchema,
  ref: external_exports.string().min(1),
  agentSlugs: external_exports.array(external_exports.string().min(1)),
  resolved: external_exports.boolean(),
  catalogSkillId: external_exports.string().min(1).optional(),
  catalogSkillKey: external_exports.string().min(1).optional(),
  localPath: external_exports.string().min(1).optional(),
  sourceLocator: external_exports.string().min(1).optional(),
  sourceRef: external_exports.string().min(1).optional()
});
var catalogTeamEnvInputSummarySchema = external_exports.object({
  key: external_exports.string().min(1),
  agentSlug: external_exports.string().min(1).nullable(),
  projectSlug: external_exports.string().min(1).nullable(),
  kind: external_exports.enum(["secret", "plain"]),
  requirement: external_exports.enum(["required", "optional"])
});
var catalogTeamSourceRefSchema = external_exports.object({
  type: external_exports.enum(["skills_sh", "github", "url", "local_path", "agent_package", "include"]),
  ref: external_exports.string().min(1),
  pinned: external_exports.boolean()
});
var catalogTeamFileSchema = external_exports.object({
  path: external_exports.string().min(1),
  kind: catalogTeamFileKindSchema,
  sizeBytes: external_exports.number().int().nonnegative(),
  sha256: external_exports.string().min(1)
});
var catalogTeamSchema = external_exports.object({
  id: external_exports.string().min(1),
  key: external_exports.string().min(1),
  kind: catalogTeamKindSchema,
  category: external_exports.string().min(1),
  slug: external_exports.string().min(1),
  name: external_exports.string().min(1),
  description: external_exports.string(),
  path: external_exports.string().min(1),
  entrypoint: external_exports.literal("TEAM.md"),
  schema: external_exports.literal("agentcompanies/v1"),
  defaultInstall: external_exports.boolean(),
  recommendedForCompanyTypes: external_exports.array(external_exports.string()),
  tags: external_exports.array(external_exports.string()),
  counts: external_exports.object({
    agents: external_exports.number().int().nonnegative(),
    projects: external_exports.number().int().nonnegative(),
    tasks: external_exports.number().int().nonnegative(),
    routines: external_exports.number().int().nonnegative(),
    localSkills: external_exports.number().int().nonnegative(),
    catalogSkills: external_exports.number().int().nonnegative(),
    externalSkillSources: external_exports.number().int().nonnegative()
  }),
  rootAgentSlugs: external_exports.array(external_exports.string()),
  agentSlugs: external_exports.array(external_exports.string()),
  projectSlugs: external_exports.array(external_exports.string()),
  requiredSkills: external_exports.array(catalogTeamSkillRequirementSchema),
  envInputs: external_exports.array(catalogTeamEnvInputSummarySchema),
  sourceRefs: external_exports.array(catalogTeamSourceRefSchema),
  files: external_exports.array(catalogTeamFileSchema),
  trustLevel: catalogTeamTrustLevelSchema,
  compatibility: catalogTeamCompatibilitySchema,
  contentHash: external_exports.string().min(1),
  packageName: external_exports.string().min(1).optional(),
  packageVersion: external_exports.string().min(1).optional()
});
var catalogTeamListQuerySchema = external_exports.object({
  kind: catalogTeamKindSchema.optional(),
  category: external_exports.string().min(1).optional(),
  q: external_exports.string().min(1).optional()
});
var catalogTeamFileDetailSchema = external_exports.object({
  catalogTeamId: external_exports.string().min(1),
  path: external_exports.string().min(1),
  kind: catalogTeamFileKindSchema,
  content: external_exports.string(),
  language: external_exports.string().nullable(),
  markdown: external_exports.boolean()
});
var catalogTeamSourcePolicySchema = external_exports.object({
  allowExternalSources: external_exports.boolean().optional(),
  allowUnpinnedOptionalSources: external_exports.boolean().optional(),
  allowLocalPathSources: external_exports.boolean().optional()
}).strict();
var catalogTeamPreviewSchema = external_exports.object({
  targetManagerAgentId: external_exports.string().min(1).nullable().optional(),
  targetManagerSlug: external_exports.string().min(1).nullable().optional(),
  include: portabilityIncludeSchema.omit({ company: true }).strict().optional(),
  agents: portabilityAgentSelectionSchema.optional(),
  collisionStrategy: portabilityCollisionStrategySchema.optional(),
  nameOverrides: external_exports.record(external_exports.string().min(1), external_exports.string().min(1)).optional(),
  selectedFiles: external_exports.array(external_exports.string().min(1)).optional(),
  sourcePolicy: catalogTeamSourcePolicySchema.optional()
}).strict();
var catalogTeamInstallSchema = catalogTeamPreviewSchema.extend({
  adapterOverrides: external_exports.record(external_exports.string().min(1), portabilityAdapterOverrideSchema).optional(),
  secretValues: external_exports.record(external_exports.string().min(1), external_exports.string()).optional()
}).strict();
var catalogTeamSkillPreparationSchema = external_exports.object({
  type: catalogTeamSkillRequirementTypeSchema,
  ref: external_exports.string().min(1),
  agentSlugs: external_exports.array(external_exports.string().min(1)),
  action: external_exports.enum([
    "already_in_package",
    "catalog_install_required",
    "external_import_required",
    "blocked"
  ]),
  catalogSkillId: external_exports.string().min(1).nullable(),
  catalogSkillKey: external_exports.string().min(1).nullable(),
  sourceLocator: external_exports.string().min(1).nullable(),
  sourceRef: external_exports.string().min(1).nullable(),
  reason: external_exports.string().min(1).nullable()
});

// ../../external/sps-core/packages/shared/src/validators/adapter-skills.ts
var agentSkillStateSchema = external_exports.enum([
  "available",
  "configured",
  "installed",
  "missing",
  "stale",
  "external"
]);
var agentSkillOriginSchema = external_exports.enum([
  "company_managed",
  "user_installed",
  "external_unknown"
]);
var agentSkillSyncModeSchema = external_exports.enum([
  "unsupported",
  "persistent",
  "ephemeral"
]);
var agentDesiredSkillEntrySchema = external_exports.object({
  key: external_exports.string().min(1),
  versionId: external_exports.string().uuid().nullable()
});
var agentDesiredSkillSelectionSchema = external_exports.union([
  external_exports.string().min(1),
  agentDesiredSkillEntrySchema
]);
var agentSkillEntrySchema = external_exports.object({
  key: external_exports.string().min(1),
  runtimeName: external_exports.string().min(1).nullable(),
  versionId: external_exports.string().uuid().nullable().optional(),
  currentVersionId: external_exports.string().uuid().nullable().optional(),
  desired: external_exports.boolean(),
  managed: external_exports.boolean(),
  state: agentSkillStateSchema,
  origin: agentSkillOriginSchema.optional(),
  originLabel: external_exports.string().nullable().optional(),
  locationLabel: external_exports.string().nullable().optional(),
  readOnly: external_exports.boolean().optional(),
  sourcePath: external_exports.string().nullable().optional(),
  targetPath: external_exports.string().nullable().optional(),
  detail: external_exports.string().nullable().optional()
});
var agentSkillSnapshotSchema = external_exports.object({
  adapterType: external_exports.string().min(1),
  supported: external_exports.boolean(),
  mode: agentSkillSyncModeSchema,
  desiredSkills: external_exports.array(external_exports.string().min(1)),
  desiredSkillEntries: external_exports.array(agentDesiredSkillEntrySchema).optional(),
  entries: external_exports.array(agentSkillEntrySchema),
  warnings: external_exports.array(external_exports.string())
});
var agentSkillSyncSchema = external_exports.object({
  desiredSkills: external_exports.array(agentDesiredSkillSelectionSchema)
});

// ../../external/sps-core/packages/shared/src/validators/agent.ts
var agentPermissionsSchema = external_exports.object({
  canCreateAgents: external_exports.boolean().optional().default(false),
  canCreateSkills: external_exports.boolean().optional().default(true),
  trustPreset: trustPresetSchema.optional(),
  authorizationPolicy: trustAuthorizationPolicySchema.optional()
}).catchall(external_exports.unknown());
var agentInstructionsBundleModeSchema = external_exports.enum(["managed", "external"]);
var updateAgentInstructionsBundleSchema = external_exports.object({
  mode: agentInstructionsBundleModeSchema.optional(),
  rootPath: external_exports.string().trim().min(1).nullable().optional(),
  entryFile: external_exports.string().trim().min(1).optional(),
  clearLegacyPromptTemplate: external_exports.boolean().optional().default(false)
});
var upsertAgentInstructionsFileSchema = external_exports.object({
  path: external_exports.string().trim().min(1),
  content: external_exports.string(),
  clearLegacyPromptTemplate: external_exports.boolean().optional().default(false)
});
var adapterConfigSchema = external_exports.record(external_exports.string(), external_exports.unknown()).superRefine((value, ctx) => {
  const envValue = value.env;
  if (envValue === void 0) return;
  const parsed = envConfigSchema.safeParse(envValue);
  if (!parsed.success) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "adapterConfig.env must be a map of valid env bindings",
      path: ["env"]
    });
  }
});
var createAgentInstructionsBundleSchema = external_exports.object({
  entryFile: external_exports.string().trim().min(1).optional(),
  files: external_exports.record(external_exports.string(), external_exports.string()).refine((files) => Object.keys(files).length > 0, {
    message: "instructionsBundle.files must contain at least one file"
  })
});
var agentModelProfileConfigSchema = external_exports.object({
  enabled: external_exports.boolean().optional(),
  label: external_exports.string().trim().min(1).optional(),
  adapterConfig: adapterConfigSchema
}).strict();
var agentRuntimeConfigSchema = external_exports.object({
  modelProfiles: external_exports.object({
    cheap: agentModelProfileConfigSchema.optional()
  }).strict().optional()
}).catchall(external_exports.unknown());
var createAgentSchema = external_exports.object({
  name: external_exports.string().min(1),
  role: external_exports.enum(AGENT_ROLES).optional().default("general"),
  title: external_exports.string().optional().nullable(),
  icon: external_exports.enum(AGENT_ICON_NAMES).optional().nullable(),
  reportsTo: external_exports.string().uuid().optional().nullable(),
  capabilities: external_exports.string().optional().nullable(),
  desiredSkills: external_exports.array(agentDesiredSkillSelectionSchema).optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: adapterConfigSchema.optional().default({}),
  instructionsBundle: createAgentInstructionsBundleSchema.optional(),
  runtimeConfig: agentRuntimeConfigSchema.optional().default({}),
  defaultEnvironmentId: external_exports.string().uuid().optional().nullable(),
  budgetMonthlyCents: external_exports.number().int().nonnegative().optional().default(0),
  permissions: agentPermissionsSchema.optional(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
});
var builtInAgentProvisionSchema = external_exports.object({
  adapterType: agentAdapterTypeSchema.optional(),
  adapterConfig: adapterConfigSchema.optional(),
  budgetMonthlyCents: external_exports.number().int().nonnegative().optional()
}).strict();
var builtInAgentEmptyMutationSchema = external_exports.object({}).strict().default({});
var builtInAgentResetSchema = external_exports.object({
  resources: external_exports.array(external_exports.enum(["agent", "instructions", "skill", "routine"])).optional()
}).strict().default({});
var createAgentHireSchema = createAgentSchema.extend({
  sourceIssueId: external_exports.string().uuid().optional().nullable(),
  sourceIssueIds: external_exports.array(external_exports.string().uuid()).optional()
});
var updateAgentSchema = createAgentSchema.omit({ permissions: true }).partial().extend({
  permissions: external_exports.never().optional(),
  replaceAdapterConfig: external_exports.boolean().optional(),
  status: external_exports.enum(AGENT_STATUSES).optional(),
  spentMonthlyCents: external_exports.number().int().nonnegative().optional()
});
var updateAgentInstructionsPathSchema = external_exports.object({
  path: external_exports.string().trim().min(1).nullable(),
  adapterConfigKey: external_exports.string().trim().min(1).optional()
});
var taskBridgeAgentKeyScopeSchema = external_exports.object({
  kind: external_exports.literal("task_bridge"),
  projectId: external_exports.string().uuid().optional().nullable(),
  projectIds: external_exports.array(external_exports.string().uuid()).max(50).optional(),
  parentIssueId: external_exports.string().uuid().optional().nullable(),
  parentIssueIds: external_exports.array(external_exports.string().uuid()).max(50).optional(),
  allowedAssigneeAgentIds: external_exports.array(external_exports.string().uuid()).max(50).optional()
}).strict().superRefine((value, ctx) => {
  const hasProjectBoundary = Boolean(value.projectId) || Boolean(value.projectIds?.length);
  const hasParentBoundary = Boolean(value.parentIssueId) || Boolean(value.parentIssueIds?.length);
  if (!hasProjectBoundary && !hasParentBoundary) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "task_bridge keys require at least one project or parent issue boundary",
      path: ["projectId"]
    });
  }
});
var standardAgentKeyScopeSchema = external_exports.object({
  kind: external_exports.literal("standard")
}).strict();
var skillTestAgentKeyScopeSchema = external_exports.object({
  kind: external_exports.literal("skill_test"),
  issueId: external_exports.string().uuid()
}).strict();
var agentApiKeyScopeSchema = external_exports.union([
  standardAgentKeyScopeSchema,
  taskBridgeAgentKeyScopeSchema,
  skillTestAgentKeyScopeSchema
]);
var createAgentKeySchema = external_exports.object({
  name: external_exports.string().min(1).default("default"),
  scope: agentApiKeyScopeSchema.optional().default({ kind: "standard" })
});
var agentMineInboxQuerySchema = external_exports.object({
  userId: external_exports.string().trim().min(1),
  status: external_exports.string().trim().min(1).optional().default(INBOX_MINE_ISSUE_STATUS_FILTER)
});
var wakeAgentSchema = external_exports.object({
  source: external_exports.enum(["timer", "assignment", "on_demand", "automation"]).optional().default("on_demand"),
  triggerDetail: external_exports.enum(["manual", "ping", "callback", "system"]).optional(),
  reason: external_exports.string().optional().nullable(),
  payload: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  idempotencyKey: external_exports.string().optional().nullable(),
  forceFreshSession: external_exports.preprocess(
    (value) => value === null ? void 0 : value,
    external_exports.boolean().optional().default(false)
  )
});
var resetAgentSessionSchema = external_exports.object({
  taskKey: external_exports.string().min(1).optional().nullable()
});
var testAdapterEnvironmentSchema = external_exports.object({
  adapterConfig: adapterConfigSchema.optional().default({}),
  /**
   * Optional environment to run the adapter test inside. When omitted, the
   * test runs against the local Paperclip host. When provided and the
   * environment is non-local (SSH/sandbox), the test probes are executed
   * inside that environment so the result reflects real agent execution.
   */
  environmentId: external_exports.string().uuid().optional().nullable()
});
var updateAgentPermissionsSchema = external_exports.object({
  canCreateAgents: external_exports.boolean(),
  canCreateSkills: external_exports.boolean().optional(),
  canAssignTasks: external_exports.boolean(),
  trustPreset: trustPresetSchema.optional(),
  authorizationPolicy: trustAuthorizationPolicySchema.optional()
});

// ../../external/sps-core/packages/shared/src/validators/project.ts
var executionWorkspaceStrategySchema2 = external_exports.object({
  type: external_exports.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
  baseRef: external_exports.string().optional().nullable(),
  branchTemplate: external_exports.string().optional().nullable(),
  worktreeParentDir: external_exports.string().optional().nullable(),
  provisionCommand: external_exports.string().optional().nullable(),
  teardownCommand: external_exports.string().optional().nullable()
}).strict();
var projectExecutionWorkspacePolicySchema = external_exports.object({
  enabled: external_exports.boolean(),
  defaultMode: external_exports.enum(["shared_workspace", "isolated_workspace", "operator_branch", "adapter_default"]).optional(),
  allowIssueOverride: external_exports.boolean().optional(),
  defaultProjectWorkspaceId: external_exports.string().uuid().optional().nullable(),
  environmentId: external_exports.string().uuid().optional().nullable(),
  workspaceStrategy: executionWorkspaceStrategySchema2.optional().nullable(),
  workspaceRuntime: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  branchPolicy: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  pullRequestPolicy: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  runtimePolicy: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  cleanupPolicy: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  authorizationPolicy: trustAuthorizationPolicySchema.optional().nullable()
}).strict();
var projectWorkspaceRuntimeConfigSchema = external_exports.object({
  workspaceRuntime: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  desiredState: external_exports.enum(["running", "stopped", "manual"]).optional().nullable(),
  serviceStates: external_exports.record(external_exports.enum(["running", "stopped", "manual"])).optional().nullable()
}).strict();
var projectWorkspaceSourceTypeSchema = external_exports.enum(["local_path", "git_repo", "remote_managed", "non_git_path"]);
var projectWorkspaceVisibilitySchema = external_exports.enum(["default", "advanced"]);
var projectWorkspaceFields = {
  name: external_exports.string().min(1).optional(),
  sourceType: projectWorkspaceSourceTypeSchema.optional(),
  cwd: external_exports.string().min(1).optional().nullable(),
  repoUrl: external_exports.string().url().optional().nullable(),
  repoRef: external_exports.string().optional().nullable(),
  defaultRef: external_exports.string().optional().nullable(),
  visibility: projectWorkspaceVisibilitySchema.optional(),
  setupCommand: external_exports.string().optional().nullable(),
  cleanupCommand: external_exports.string().optional().nullable(),
  remoteProvider: external_exports.string().optional().nullable(),
  remoteWorkspaceRef: external_exports.string().optional().nullable(),
  sharedWorkspaceKey: external_exports.string().optional().nullable(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  runtimeConfig: projectWorkspaceRuntimeConfigSchema.optional().nullable()
};
function validateProjectWorkspace(value, ctx) {
  const sourceType = value.sourceType ?? "local_path";
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  const hasRemoteRef = typeof value.remoteWorkspaceRef === "string" && value.remoteWorkspaceRef.trim().length > 0;
  if (sourceType === "remote_managed") {
    if (!hasRemoteRef && !hasRepo) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Remote-managed workspace requires remoteWorkspaceRef or repoUrl.",
        path: ["remoteWorkspaceRef"]
      });
    }
    return;
  }
  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "Workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"]
    });
  }
}
var createProjectWorkspaceSchema = external_exports.object({
  ...projectWorkspaceFields,
  isPrimary: external_exports.boolean().optional().default(false)
}).superRefine(validateProjectWorkspace);
var updateProjectWorkspaceSchema = external_exports.object({
  ...projectWorkspaceFields,
  isPrimary: external_exports.boolean().optional()
}).partial();
var projectFields = {
  /** @deprecated Use goalIds instead */
  goalId: external_exports.string().uuid().optional().nullable(),
  goalIds: external_exports.array(external_exports.string().uuid()).optional(),
  name: external_exports.string().min(1),
  description: external_exports.string().optional().nullable(),
  status: external_exports.enum(PROJECT_STATUSES).optional().default("backlog"),
  leadAgentId: external_exports.string().uuid().optional().nullable(),
  targetDate: external_exports.string().optional().nullable(),
  color: external_exports.string().optional().nullable(),
  icon: external_exports.enum(PROJECT_ICON_NAMES).optional().nullable(),
  env: envConfigSchema.optional().nullable(),
  accessMode: external_exports.enum(PROJECT_ACCESS_MODES).optional(),
  executionWorkspacePolicy: projectExecutionWorkspacePolicySchema.optional().nullable(),
  archivedAt: external_exports.string().datetime().optional().nullable()
};
var createProjectSchema = external_exports.object({
  ...projectFields,
  workspace: createProjectWorkspaceSchema.optional()
});
var updateProjectSchema = external_exports.object(projectFields).partial();
var projectAccessGrantSchema = external_exports.object({
  principalType: external_exports.enum(["user", "agent"]),
  principalId: external_exports.string().trim().min(1),
  accessRole: external_exports.enum(PROJECT_ACCESS_ROLES)
}).strict();
var updateProjectAccessPolicySchema = external_exports.object({
  accessMode: external_exports.enum(PROJECT_ACCESS_MODES),
  grants: external_exports.array(projectAccessGrantSchema).max(200)
}).strict();

// ../../external/sps-core/packages/shared/src/validators/document-annotation.ts
var documentAnnotationThreadStatusSchema = external_exports.enum(DOCUMENT_ANNOTATION_THREAD_STATUSES);
var documentAnnotationAnchorStateSchema = external_exports.enum(DOCUMENT_ANNOTATION_ANCHOR_STATES);
var documentAnnotationAnchorConfidenceSchema = external_exports.enum(DOCUMENT_ANNOTATION_ANCHOR_CONFIDENCES);
var documentAnnotationTextQuoteSelectorSchema = external_exports.object({
  exact: external_exports.string().min(1).max(1e4),
  prefix: external_exports.string().max(1e3).default(""),
  suffix: external_exports.string().max(1e3).default("")
}).strict();
var documentAnnotationTextPositionSelectorSchema = external_exports.object({
  normalizedStart: external_exports.number().int().nonnegative(),
  normalizedEnd: external_exports.number().int().nonnegative(),
  markdownStart: external_exports.number().int().nonnegative(),
  markdownEnd: external_exports.number().int().nonnegative()
}).strict().superRefine((value, ctx) => {
  if (value.normalizedEnd <= value.normalizedStart) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "normalizedEnd must be greater than normalizedStart",
      path: ["normalizedEnd"]
    });
  }
  if (value.markdownEnd <= value.markdownStart) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "markdownEnd must be greater than markdownStart",
      path: ["markdownEnd"]
    });
  }
});
var documentAnnotationAnchorSelectorSchema = external_exports.object({
  quote: documentAnnotationTextQuoteSelectorSchema,
  position: documentAnnotationTextPositionSelectorSchema
}).strict();
var createDocumentAnnotationThreadSchema = external_exports.object({
  baseRevisionId: external_exports.string().uuid(),
  baseRevisionNumber: external_exports.number().int().positive(),
  selector: documentAnnotationAnchorSelectorSchema,
  body: multilineTextSchema.pipe(external_exports.string().min(1).max(2e4)),
  issueCommentId: external_exports.string().uuid().nullable().optional()
}).strict();
var createDocumentAnnotationCommentSchema = external_exports.object({
  body: multilineTextSchema.pipe(external_exports.string().min(1).max(2e4)),
  issueCommentId: external_exports.string().uuid().nullable().optional()
}).strict();
var updateDocumentAnnotationThreadSchema = external_exports.object({
  status: documentAnnotationThreadStatusSchema.optional()
}).strict().refine((value) => value.status != null, {
  message: "At least one field must be provided"
});

// ../../external/sps-core/packages/shared/src/agent-url-key.ts
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuidLike(value) {
  if (typeof value !== "string") return false;
  return UUID_RE.test(value.trim());
}

// ../../external/sps-core/packages/shared/src/validators/search.ts
var COMPANY_SEARCH_MAX_QUERY_LENGTH = 200;
var COMPANY_SEARCH_DEFAULT_LIMIT = 20;
var COMPANY_SEARCH_MAX_LIMIT = 50;
var COMPANY_SEARCH_MAX_OFFSET = 200;
var UPDATED_WITHIN_RE = /^[1-9]\d{0,2}(h|d|w|m)$/;
function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
function queryValues(value) {
  if (value === void 0 || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
function parseOptionalString(value, ctx, field) {
  const raw = firstQueryValue(value);
  if (raw === void 0 || raw === null) return void 0;
  if (typeof raw !== "string" && typeof raw !== "number") {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: `${field} must be a string` });
    return void 0;
  }
  const normalized = String(raw).trim();
  return normalized.length > 0 ? normalized : void 0;
}
function parseIntegerQuery(value, ctx, field, fallback, min, max) {
  const raw = firstQueryValue(value);
  if (raw === void 0 || raw === null || raw === "") return fallback;
  const text4 = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^-?\d+$/.test(text4)) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: `${field} must be an integer` });
    return fallback;
  }
  const numeric = Number.parseInt(text4, 10);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    const range = min === 0 ? `between 0 and ${max}` : `between ${min} and ${max}`;
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: `${field} must be ${range}` });
    return fallback;
  }
  return numeric;
}
function parseEnumList(value, ctx, field, allowed) {
  const allowedSet = new Set(allowed);
  const values = [];
  for (const rawEntry of queryValues(value)) {
    if (typeof rawEntry !== "string") {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: `${field} must be a comma-separated string` });
      continue;
    }
    for (const rawItem of rawEntry.split(",")) {
      const item = rawItem.trim();
      if (!item) continue;
      if (!allowedSet.has(item)) {
        ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: `${field} contains an unsupported value` });
        continue;
      }
      if (!values.includes(item)) values.push(item);
    }
  }
  return values;
}
function parseOptionalUuid(value, ctx, field) {
  const normalized = parseOptionalString(value, ctx, field);
  if (normalized === void 0) return void 0;
  if (!isUuidLike(normalized)) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: `${field} must be a UUID` });
    return void 0;
  }
  return normalized;
}
function parseAssigneeAgentId(value, ctx) {
  const normalized = parseOptionalString(value, ctx, "assigneeAgentId");
  if (normalized === void 0) return void 0;
  if (normalized.toLowerCase() === "null") return null;
  if (!isUuidLike(normalized)) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "assigneeAgentId must be a UUID or 'null'" });
    return void 0;
  }
  return normalized;
}
function parseUpdatedAfter(value, ctx) {
  const normalized = parseOptionalString(value, ctx, "updatedAfter");
  if (normalized === void 0) return void 0;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "updatedAfter must be a valid date" });
    return void 0;
  }
  return date.toISOString();
}
function parseUpdatedWithin(value, ctx) {
  const normalized = parseOptionalString(value, ctx, "updatedWithin");
  if (normalized === void 0) return void 0;
  if (!UPDATED_WITHIN_RE.test(normalized)) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "updatedWithin must be a duration like 24h, 7d, 4w, or 3m" });
    return void 0;
  }
  return normalized;
}
var companySearchQuerySchema = external_exports.object({
  q: external_exports.unknown().optional().transform((value, ctx) => (parseOptionalString(value, ctx, "q") ?? "").slice(0, COMPANY_SEARCH_MAX_QUERY_LENGTH)),
  scope: external_exports.unknown().optional().transform((value, ctx) => {
    const normalized = parseOptionalString(value, ctx, "scope") ?? "all";
    if (!COMPANY_SEARCH_SCOPES.includes(normalized)) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "scope must be a supported search scope" });
      return "all";
    }
    return normalized;
  }),
  limit: external_exports.unknown().optional().transform((value, ctx) => parseIntegerQuery(value, ctx, "limit", COMPANY_SEARCH_DEFAULT_LIMIT, 1, COMPANY_SEARCH_MAX_LIMIT)),
  offset: external_exports.unknown().optional().transform((value, ctx) => parseIntegerQuery(value, ctx, "offset", 0, 0, COMPANY_SEARCH_MAX_OFFSET)),
  status: external_exports.unknown().optional().transform((value, ctx) => parseEnumList(value, ctx, "status", ISSUE_STATUSES)),
  priority: external_exports.unknown().optional().transform((value, ctx) => parseEnumList(value, ctx, "priority", ISSUE_PRIORITIES)),
  assigneeAgentId: external_exports.unknown().optional().transform((value, ctx) => parseAssigneeAgentId(value, ctx)),
  assigneeUserId: external_exports.unknown().optional().transform((value, ctx) => parseOptionalString(value, ctx, "assigneeUserId")),
  projectId: external_exports.unknown().optional().transform((value, ctx) => parseOptionalUuid(value, ctx, "projectId")),
  labelId: external_exports.unknown().optional().transform((value, ctx) => parseOptionalUuid(value, ctx, "labelId")),
  updatedWithin: external_exports.unknown().optional().transform((value, ctx) => parseUpdatedWithin(value, ctx)),
  updatedAfter: external_exports.unknown().optional().transform((value, ctx) => parseUpdatedAfter(value, ctx)),
  sort: external_exports.unknown().optional().transform((value, ctx) => {
    const normalized = parseOptionalString(value, ctx, "sort") ?? "relevance";
    if (!COMPANY_SEARCH_SORTS.includes(normalized)) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "sort must be relevance, updated, created, or priority" });
      return "relevance";
    }
    return normalized;
  })
});

// ../../external/sps-core/packages/shared/src/validators/issue-tree-control.ts
var issueTreeControlModeSchema = external_exports.enum(ISSUE_TREE_CONTROL_MODES);
var issueTreeHoldReleasePolicySchema = external_exports.object({
  strategy: external_exports.enum(ISSUE_TREE_HOLD_RELEASE_POLICY_STRATEGIES).default("manual"),
  note: external_exports.string().trim().min(1).max(500).optional().nullable()
}).strict();
var previewIssueTreeControlSchema = external_exports.object({
  mode: issueTreeControlModeSchema,
  releasePolicy: issueTreeHoldReleasePolicySchema.optional().nullable()
}).strict();
var createIssueTreeHoldSchema = external_exports.object({
  mode: issueTreeControlModeSchema,
  reason: external_exports.string().trim().min(1).max(1e3).optional().nullable(),
  releasePolicy: issueTreeHoldReleasePolicySchema.optional().nullable(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
}).strict();
var releaseIssueTreeHoldSchema = external_exports.object({
  reason: external_exports.string().trim().min(1).max(1e3).optional().nullable(),
  releasePolicy: issueTreeHoldReleasePolicySchema.optional().nullable(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
}).strict();

// ../../external/sps-core/packages/shared/src/validators/workspace-file-resource.ts
var workspaceFileListSearchMaxBytes = 128;
function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}
var workspaceFileWorkspaceKindSchema = external_exports.enum(["execution_workspace", "project_workspace"]);
var workspaceFileSelectorSchema = external_exports.enum(["auto", "execution", "project"]).default("auto");
var workspaceFileListModeSchema = external_exports.enum(["all", "recent", "changed"]).default("all");
var workspaceFilePreviewKindSchema = external_exports.enum(["text", "image", "video", "pdf", "unsupported"]);
var workspaceFileResourceKindSchema = external_exports.enum(["file", "directory", "remote_resource"]);
var workspaceFileRefSchema = external_exports.object({
  kind: external_exports.literal("workspace_file"),
  issueId: external_exports.string().uuid().optional(),
  projectId: external_exports.string().uuid().optional(),
  projectName: external_exports.string().min(1).optional(),
  workspaceKind: workspaceFileWorkspaceKindSchema,
  workspaceId: external_exports.string().uuid(),
  relativePath: external_exports.string().min(1),
  line: external_exports.number().int().positive().nullable().optional(),
  column: external_exports.number().int().positive().nullable().optional(),
  displayPath: external_exports.string().min(1)
});
var workspaceFileResourceQuerySchema = external_exports.object({
  projectId: external_exports.string().uuid().optional(),
  workspaceId: external_exports.string().uuid().optional(),
  path: external_exports.string().min(1).refine((value) => !/[\x00-\x1f\x7f]/.test(value), {
    message: "Workspace file path contains an invalid character",
    params: { code: "invalid_path" }
  }),
  workspace: workspaceFileSelectorSchema.optional()
}).refine((value) => Boolean(value.projectId) === Boolean(value.workspaceId), {
  message: "Workspace file target requires both projectId and workspaceId",
  path: ["workspaceId"],
  params: { code: "invalid_target" }
});
var workspaceFileListQuerySchema = external_exports.object({
  projectId: external_exports.string().uuid().optional(),
  workspaceId: external_exports.string().uuid().optional(),
  workspace: workspaceFileSelectorSchema.optional(),
  path: external_exports.string().min(1).refine((value) => !/[\x00-\x1f\x7f]/.test(value), {
    message: "Workspace folder path contains an invalid character",
    params: { code: "invalid_path" }
  }).optional(),
  mode: workspaceFileListModeSchema.optional(),
  q: external_exports.string().refine((value) => !/[\x00-\x1f\x7f]/.test(value), {
    message: "Workspace file search contains an invalid character",
    params: { code: "invalid_query" }
  }).refine((value) => utf8ByteLength(value.trim()) <= workspaceFileListSearchMaxBytes, {
    message: "Workspace file search is too long",
    params: { code: "invalid_query" }
  }).optional(),
  limit: external_exports.coerce.number().int().min(1).max(100).default(25),
  offset: external_exports.coerce.number().int().min(0).max(1e4).default(0)
}).refine((value) => Boolean(value.projectId) === Boolean(value.workspaceId), {
  message: "Workspace file target requires both projectId and workspaceId",
  path: ["workspaceId"],
  params: { code: "invalid_target" }
});
var resolvedWorkspaceResourceSchema = external_exports.object({
  kind: workspaceFileResourceKindSchema,
  provider: external_exports.string().min(1),
  title: external_exports.string().min(1),
  displayPath: external_exports.string().min(1),
  workspaceLabel: external_exports.string().min(1),
  workspaceKind: workspaceFileWorkspaceKindSchema,
  workspaceId: external_exports.string().uuid(),
  projectId: external_exports.string().uuid().nullable().optional(),
  projectName: external_exports.string().min(1).nullable().optional(),
  contentType: external_exports.string().nullable().optional(),
  byteSize: external_exports.number().int().nonnegative().nullable().optional(),
  previewKind: workspaceFilePreviewKindSchema,
  denialReason: external_exports.string().nullable().optional(),
  capabilities: external_exports.object({
    preview: external_exports.boolean(),
    download: external_exports.boolean(),
    listChildren: external_exports.boolean()
  })
});
var workspaceFileContentSchema = external_exports.object({
  resource: resolvedWorkspaceResourceSchema,
  content: external_exports.object({
    encoding: external_exports.enum(["utf8", "base64"]),
    data: external_exports.string()
  })
});

// ../../external/sps-core/packages/shared/src/validators/work-product.ts
function attachmentContentPath(attachmentId) {
  return `/api/attachments/${attachmentId}/content`;
}
var issueWorkProductTypeSchema = external_exports.enum([
  "preview_url",
  "runtime_service",
  "pull_request",
  "branch",
  "commit",
  "artifact",
  "document"
]);
var issueWorkProductStatusSchema = external_exports.enum([
  "active",
  "ready_for_review",
  "approved",
  "changes_requested",
  "merged",
  "closed",
  "failed",
  "archived",
  "draft"
]);
var issueWorkProductReviewStateSchema = external_exports.enum([
  "none",
  "needs_board_review",
  "approved",
  "changes_requested"
]);
var attachmentArtifactWorkProductMetadataSchema = external_exports.object({
  attachmentId: external_exports.string().uuid(),
  contentType: external_exports.string().min(1),
  byteSize: external_exports.number().int().nonnegative(),
  contentPath: external_exports.string().min(1),
  openPath: external_exports.string().min(1),
  downloadPath: external_exports.string().min(1),
  originalFilename: external_exports.string().optional().nullable()
}).superRefine((value, ctx) => {
  const contentPath = attachmentContentPath(value.attachmentId);
  if (value.contentPath !== contentPath) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["contentPath"],
      message: "contentPath must point to the same-origin attachment content route"
    });
  }
  if (value.openPath !== contentPath) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["openPath"],
      message: "openPath must point to the same-origin attachment content route"
    });
  }
  if (value.downloadPath !== `${contentPath}?download=1`) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["downloadPath"],
      message: "downloadPath must point to the same-origin attachment download route"
    });
  }
});
var issueWorkProductMetadataSchema = external_exports.object({
  resourceRef: workspaceFileRefSchema.optional().nullable()
}).passthrough();
var createIssueWorkProductSchema = external_exports.object({
  projectId: external_exports.string().uuid().optional().nullable(),
  executionWorkspaceId: external_exports.string().uuid().optional().nullable(),
  runtimeServiceId: external_exports.string().uuid().optional().nullable(),
  type: issueWorkProductTypeSchema,
  provider: external_exports.string().min(1),
  externalId: external_exports.string().optional().nullable(),
  title: external_exports.string().min(1),
  url: external_exports.string().url().optional().nullable(),
  status: issueWorkProductStatusSchema.default("active"),
  reviewState: issueWorkProductReviewStateSchema.optional().default("none"),
  isPrimary: external_exports.boolean().optional().default(false),
  healthStatus: external_exports.enum(["unknown", "healthy", "unhealthy"]).optional().default("unknown"),
  summary: external_exports.string().optional().nullable(),
  metadata: issueWorkProductMetadataSchema.optional().nullable(),
  createdByRunId: external_exports.string().uuid().optional().nullable()
});
var updateIssueWorkProductSchema = createIssueWorkProductSchema.partial();

// ../../external/sps-core/packages/shared/src/validators/artifact.ts
var COMPANY_ARTIFACTS_DEFAULT_LIMIT = 30;
var COMPANY_ARTIFACTS_MAX_LIMIT = 100;
var COMPANY_ARTIFACTS_MAX_QUERY_LENGTH = 160;
var companyArtifactSourceSchema = external_exports.enum(["document", "attachment", "work_product"]);
var companyArtifactMediaKindSchema = external_exports.enum(["image", "video", "text", "document", "file", "empty"]);
var companyArtifactGroupBySchema = external_exports.enum(["none", "task", "parent_task"]);
var companyArtifactsQuerySchema = external_exports.object({
  kind: external_exports.enum(["image", "video", "text", "document", "file", "all"]).optional().default("all"),
  projectId: external_exports.string().uuid().optional(),
  q: external_exports.string().trim().max(COMPANY_ARTIFACTS_MAX_QUERY_LENGTH).optional(),
  groupBy: companyArtifactGroupBySchema.optional().default("none"),
  groupIssueId: external_exports.string().uuid().optional(),
  limit: external_exports.coerce.number().int().min(1).max(COMPANY_ARTIFACTS_MAX_LIMIT).optional().default(COMPANY_ARTIFACTS_DEFAULT_LIMIT),
  cursor: external_exports.string().min(1).optional()
});
var companyArtifactSchema = external_exports.object({
  id: external_exports.string().min(1),
  source: companyArtifactSourceSchema,
  mediaKind: companyArtifactMediaKindSchema,
  title: external_exports.string(),
  previewText: external_exports.string().nullable(),
  contentType: external_exports.string().nullable(),
  contentPath: external_exports.string().nullable(),
  openPath: external_exports.string().nullable(),
  downloadPath: external_exports.string().nullable(),
  issue: external_exports.object({
    id: external_exports.string().uuid(),
    identifier: external_exports.string(),
    title: external_exports.string()
  }),
  project: external_exports.object({
    id: external_exports.string().uuid(),
    name: external_exports.string()
  }).nullable(),
  createdByAgent: external_exports.object({
    id: external_exports.string().uuid(),
    name: external_exports.string()
  }).nullable(),
  updatedAt: external_exports.string().datetime(),
  href: external_exports.string().min(1)
});
var companyArtifactGroupSchema = external_exports.object({
  id: external_exports.string().min(1),
  groupBy: companyArtifactGroupBySchema.exclude(["none"]),
  issue: external_exports.object({
    id: external_exports.string().uuid(),
    identifier: external_exports.string(),
    title: external_exports.string()
  }),
  title: external_exports.string(),
  count: external_exports.number().int().min(0),
  mediaKinds: external_exports.array(companyArtifactMediaKindSchema),
  previewArtifacts: external_exports.array(companyArtifactSchema),
  updatedAt: external_exports.string().datetime(),
  href: external_exports.string().min(1)
});
var companyArtifactsResponseSchema = external_exports.object({
  artifacts: external_exports.array(companyArtifactSchema),
  groups: external_exports.array(companyArtifactGroupSchema).optional(),
  selectedGroup: companyArtifactGroupSchema.nullable().optional(),
  nextCursor: external_exports.string().nullable()
});

// ../../external/sps-core/packages/shared/src/validators/goal.ts
var createGoalSchema = external_exports.object({
  title: external_exports.string().min(1),
  description: external_exports.string().optional().nullable(),
  level: external_exports.enum(GOAL_LEVELS).optional().default("task"),
  status: external_exports.enum(GOAL_STATUSES).optional().default("planned"),
  parentId: external_exports.string().uuid().optional().nullable(),
  ownerAgentId: external_exports.string().uuid().optional().nullable()
});
var updateGoalSchema = createGoalSchema.partial();

// ../../external/sps-core/packages/shared/src/validators/approval.ts
var createApprovalSchema = external_exports.object({
  type: external_exports.enum(APPROVAL_TYPES),
  requestedByAgentId: external_exports.string().uuid().optional().nullable(),
  payload: external_exports.record(external_exports.string(), external_exports.unknown()),
  issueIds: external_exports.array(external_exports.string().uuid()).optional()
});
var resolveApprovalSchema = external_exports.object({
  decisionNote: multilineTextSchema.optional().nullable()
});
var requestApprovalRevisionSchema = external_exports.object({
  decisionNote: multilineTextSchema.optional().nullable()
});
var resubmitApprovalSchema = external_exports.object({
  payload: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
});
var addApprovalCommentSchema = external_exports.object({
  body: multilineTextSchema.pipe(external_exports.string().min(1))
});

// ../../external/sps-core/packages/shared/src/validators/cost.ts
var createCostEventSchema = external_exports.object({
  agentId: external_exports.string().uuid(),
  issueId: external_exports.string().uuid().optional().nullable(),
  projectId: external_exports.string().uuid().optional().nullable(),
  goalId: external_exports.string().uuid().optional().nullable(),
  heartbeatRunId: external_exports.string().uuid().optional().nullable(),
  billingCode: external_exports.string().optional().nullable(),
  provider: external_exports.string().min(1),
  biller: external_exports.string().min(1).optional(),
  billingType: external_exports.enum(BILLING_TYPES).optional().default("unknown"),
  model: external_exports.string().min(1),
  inputTokens: external_exports.number().int().nonnegative().optional().default(0),
  cachedInputTokens: external_exports.number().int().nonnegative().optional().default(0),
  outputTokens: external_exports.number().int().nonnegative().optional().default(0),
  costCents: external_exports.number().int().nonnegative(),
  occurredAt: external_exports.string().datetime()
}).transform((value) => ({
  ...value,
  biller: value.biller ?? value.provider
}));
var updateBudgetSchema = external_exports.object({
  budgetMonthlyCents: external_exports.number().int().nonnegative()
});

// ../../external/sps-core/packages/shared/src/validators/finance.ts
var createFinanceEventSchema = external_exports.object({
  agentId: external_exports.string().uuid().optional().nullable(),
  issueId: external_exports.string().uuid().optional().nullable(),
  projectId: external_exports.string().uuid().optional().nullable(),
  goalId: external_exports.string().uuid().optional().nullable(),
  heartbeatRunId: external_exports.string().uuid().optional().nullable(),
  costEventId: external_exports.string().uuid().optional().nullable(),
  billingCode: external_exports.string().optional().nullable(),
  description: external_exports.string().max(500).optional().nullable(),
  eventKind: external_exports.enum(FINANCE_EVENT_KINDS),
  direction: external_exports.enum(FINANCE_DIRECTIONS).optional().default("debit"),
  biller: external_exports.string().min(1),
  provider: external_exports.string().min(1).optional().nullable(),
  executionAdapterType: external_exports.enum(AGENT_ADAPTER_TYPES).optional().nullable(),
  pricingTier: external_exports.string().min(1).optional().nullable(),
  region: external_exports.string().min(1).optional().nullable(),
  model: external_exports.string().min(1).optional().nullable(),
  quantity: external_exports.number().int().nonnegative().optional().nullable(),
  unit: external_exports.enum(FINANCE_UNITS).optional().nullable(),
  amountCents: external_exports.number().int().nonnegative(),
  currency: external_exports.string().length(3).optional().default("USD"),
  estimated: external_exports.boolean().optional().default(false),
  externalInvoiceId: external_exports.string().optional().nullable(),
  metadataJson: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  occurredAt: external_exports.string().datetime()
}).transform((value) => ({
  ...value,
  currency: value.currency.toUpperCase()
}));

// ../../external/sps-core/packages/shared/src/validators/asset.ts
var createAssetImageMetadataSchema = external_exports.object({
  namespace: external_exports.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9/_-]+$/).optional()
});

// ../../external/sps-core/packages/shared/src/validators/pipeline.ts
var routineVariableLikeNameSchema = external_exports.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
var pipelineStageKindSchema = external_exports.enum(["working", "review", "done", "cancelled"]);
var legacyPipelineStageKindSchema = external_exports.enum(["open", "working", "review", "done", "cancelled"]);
var pipelineStageApproverSchema = external_exports.object({
  kind: external_exports.enum(["any_human", "user", "agent"]).optional().default("any_human"),
  id: external_exports.string().trim().min(1).max(200).optional()
}).superRefine((value, ctx) => {
  if (value.kind !== "any_human" && (typeof value.id !== "string" || value.id.length === 0)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["id"],
      message: "Specific stage approvers require an id"
    });
  }
});
var pipelineStageOnEnterSchema = external_exports.object({
  type: external_exports.literal("run_routine"),
  routineId: external_exports.string().uuid(),
  id: external_exports.string().trim().min(1).max(200).optional(),
  projectId: external_exports.string().uuid().optional().nullable(),
  projectWorkspaceId: external_exports.string().uuid().optional().nullable(),
  executionWorkspaceId: external_exports.string().uuid().optional().nullable(),
  executionWorkspacePreference: external_exports.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional().nullable(),
  executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable()
}).passthrough();
var pipelineStageAutomationSchema = external_exports.object({
  routineId: external_exports.string().uuid().optional().nullable(),
  assigneeAgentId: external_exports.string().uuid().optional().nullable(),
  instructionsBody: external_exports.string().optional().nullable(),
  projectId: external_exports.string().uuid().optional().nullable(),
  projectWorkspaceId: external_exports.string().uuid().optional().nullable(),
  executionWorkspaceId: external_exports.string().uuid().optional().nullable(),
  executionWorkspacePreference: external_exports.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional().nullable(),
  executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable()
}).passthrough();
var pipelineStageCarryOverPolicySchema = external_exports.object({
  version: external_exports.literal(1).default(1),
  mode: external_exports.enum(["all_except", "only"]).default("all_except"),
  includeFields: external_exports.array(routineVariableLikeNameSchema).max(100).default([]),
  excludeFields: external_exports.array(routineVariableLikeNameSchema).max(100).default([])
});
var pipelineStageBreakdownSchema = external_exports.object({
  targetPipelineId: external_exports.string().uuid(),
  targetStageKey: external_exports.string().trim().min(1).max(120),
  pieceNoun: external_exports.string().trim().min(1).max(80).default("piece"),
  carryOverPolicy: pipelineStageCarryOverPolicySchema.optional(),
  inheritFields: external_exports.array(routineVariableLikeNameSchema).max(100).default([]),
  advanceTo: external_exports.string().trim().min(1).max(120).optional(),
  waitForPieces: external_exports.boolean().optional().default(false),
  whenFinishedMoveTo: external_exports.string().trim().min(1).max(120).optional()
}).superRefine((value, ctx) => {
  if (value.waitForPieces && !value.whenFinishedMoveTo) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["whenFinishedMoveTo"],
      message: "Breakdown stages that wait for pieces need a destination stage"
    });
  }
});
var pipelineStageVariableSchema = external_exports.object({
  key: routineVariableLikeNameSchema,
  label: external_exports.string().trim().max(120),
  type: external_exports.enum(["select", "text", "multiline"]).default("text"),
  options: external_exports.array(external_exports.string().trim().min(1).max(120)).max(50).optional().default([]),
  required: external_exports.boolean().optional().default(false),
  showInAddForm: external_exports.boolean().optional().default(false)
}).superRefine((value, ctx) => {
  if (value.type === "select" && value.options.length === 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["options"],
      message: "Select variables require at least one option"
    });
  }
  if (value.type !== "select" && value.options.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["options"],
      message: "Only select variables can define options"
    });
  }
});
var pipelineStageConfigSchema = external_exports.object({
  variables: external_exports.array(pipelineStageVariableSchema).default([]),
  disabled: external_exports.boolean().optional(),
  disabledReason: external_exports.string().trim().max(1e3).nullable().optional(),
  requireApproval: external_exports.boolean().optional(),
  approver: pipelineStageApproverSchema.optional(),
  /** Legacy input only; the server migrates it to requireApproval/approver. */
  reviewerKind: external_exports.enum(["human", "any"]).optional(),
  whatHappensHere: external_exports.string().trim().max(1e4).optional(),
  onEnter: pipelineStageOnEnterSchema.optional(),
  automation: pipelineStageAutomationSchema.optional(),
  breakdown: pipelineStageBreakdownSchema.optional(),
  approveToStageKey: external_exports.string().trim().min(1).max(120).optional(),
  rejectToStageKey: external_exports.string().trim().min(1).max(120).optional(),
  requestChangesToStageKey: external_exports.string().trim().min(1).max(120).optional(),
  requireRejectReason: external_exports.boolean().optional(),
  requireRequestChangesReason: external_exports.boolean().optional(),
  requireChildrenTerminal: external_exports.boolean().optional(),
  requireNoUnresolvedDrift: external_exports.boolean().optional()
}).passthrough().superRefine((value, ctx) => {
  const keys = /* @__PURE__ */ new Set();
  value.variables.forEach((variable, index) => {
    if (keys.has(variable.key)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["variables", index, "key"],
        message: "Pipeline stage variable keys must be unique"
      });
    }
    keys.add(variable.key);
  });
});
var pipelineAutomationRetryScopeSchema = external_exports.enum(["current_stage", "previous_stage"]);
var pipelineAutomationRetryCleanupOptionsSchema = external_exports.object({
  retireDirectChildren: external_exports.boolean().default(true),
  retireDescendants: external_exports.boolean().default(true),
  cancelLinkedAutomationIssues: external_exports.boolean().default(true)
});
var pipelineAutomationRetryRequestSchema = external_exports.object({
  scope: pipelineAutomationRetryScopeSchema,
  targetStageId: external_exports.string().uuid().nullable().optional(),
  expectedVersion: external_exports.number().int().positive(),
  cleanup: pipelineAutomationRetryCleanupOptionsSchema.default({
    retireDirectChildren: true,
    retireDescendants: true,
    cancelLinkedAutomationIssues: true
  })
});

// ../../external/sps-core/packages/shared/src/validators/access.ts
var createCompanyInviteSchema = external_exports.object({
  allowedJoinTypes: external_exports.enum(INVITE_JOIN_TYPES).default("both"),
  humanRole: external_exports.enum(HUMAN_COMPANY_MEMBERSHIP_ROLES).optional().nullable(),
  defaultsPayload: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  agentMessage: external_exports.string().max(4e3).optional().nullable(),
  expiresInMinutes: external_exports.number().int().refine((value) => [15, 60, 24 * 60, 7 * 24 * 60].includes(value), {
    message: "expiresInMinutes must be one of 15, 60, 1440, or 10080"
  }).optional()
});
var createOpenClawInvitePromptSchema = external_exports.object({
  agentMessage: external_exports.string().max(4e3).optional().nullable()
});
var acceptInviteSchema = external_exports.object({
  requestType: external_exports.enum(JOIN_REQUEST_TYPES),
  agentName: external_exports.string().min(1).max(120).optional(),
  adapterType: optionalAgentAdapterTypeSchema,
  capabilities: external_exports.string().max(4e3).optional().nullable(),
  agentDefaultsPayload: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  // OpenClaw join compatibility fields accepted at top level.
  responsesWebhookUrl: external_exports.string().max(4e3).optional().nullable(),
  responsesWebhookMethod: external_exports.string().max(32).optional().nullable(),
  responsesWebhookHeaders: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable(),
  paperclipApiUrl: external_exports.string().max(4e3).optional().nullable(),
  webhookAuthHeader: external_exports.string().max(4e3).optional().nullable()
});
var listJoinRequestsQuerySchema = external_exports.object({
  status: external_exports.enum(JOIN_REQUEST_STATUSES).optional(),
  requestType: external_exports.enum(JOIN_REQUEST_TYPES).optional()
});
var listCompanyInvitesQuerySchema = external_exports.object({
  state: external_exports.enum(["active", "revoked", "accepted", "expired"]).optional(),
  limit: external_exports.coerce.number().int().min(1).max(100).optional().default(20),
  offset: external_exports.coerce.number().int().min(0).optional().default(0)
});
var claimJoinRequestApiKeySchema = external_exports.object({
  claimSecret: external_exports.string().min(16).max(256)
});
var boardCliAuthAccessLevelSchema = external_exports.enum([
  "board",
  "instance_admin_required"
]);
var createCliAuthChallengeSchema = external_exports.object({
  command: external_exports.string().min(1).max(240),
  clientName: external_exports.string().max(120).optional().nullable(),
  requestedAccess: boardCliAuthAccessLevelSchema.default("board"),
  requestedCompanyId: external_exports.string().uuid().optional().nullable()
});
var resolveCliAuthChallengeSchema = external_exports.object({
  token: external_exports.string().min(16).max(256)
});
var createBoardApiKeySchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(120).default("paperclipai cli"),
  expiresAt: external_exports.coerce.date().optional().nullable(),
  requestedCompanyId: external_exports.string().uuid().optional().nullable()
});
var updateMemberPermissionsSchema = external_exports.object({
  grants: external_exports.array(
    external_exports.object({
      permissionKey: external_exports.enum(PERMISSION_KEYS),
      scope: external_exports.record(external_exports.string(), external_exports.unknown()).optional().nullable()
    })
  )
});
var editableMembershipStatuses = ["pending", "active", "suspended"];
var updateCompanyMemberSchema = external_exports.object({
  membershipRole: external_exports.enum(HUMAN_COMPANY_MEMBERSHIP_ROLES).optional().nullable(),
  status: external_exports.enum(editableMembershipStatuses).optional()
}).refine((value) => value.membershipRole !== void 0 || value.status !== void 0, {
  message: "membershipRole or status is required"
});
var updateCompanyMemberWithPermissionsSchema = external_exports.object({
  membershipRole: external_exports.enum(HUMAN_COMPANY_MEMBERSHIP_ROLES).optional().nullable(),
  status: external_exports.enum(editableMembershipStatuses).optional(),
  grants: updateMemberPermissionsSchema.shape.grants.default([])
}).refine((value) => value.membershipRole !== void 0 || value.status !== void 0, {
  message: "membershipRole or status is required"
});
var archiveCompanyMemberSchema = external_exports.object({
  reassignment: external_exports.object({
    assigneeAgentId: external_exports.string().uuid().optional().nullable(),
    assigneeUserId: external_exports.string().uuid().optional().nullable()
  }).optional().nullable()
}).superRefine((value, ctx) => {
  if (value.reassignment?.assigneeAgentId && value.reassignment.assigneeUserId) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "Choose either an agent or user reassignment target",
      path: ["reassignment"]
    });
  }
});
var updateUserCompanyAccessSchema = external_exports.object({
  companyIds: external_exports.array(external_exports.string().uuid()).default([])
});
var searchAdminUsersQuerySchema = external_exports.object({
  query: external_exports.string().trim().max(120).optional().default("")
});
var profileImageAssetPathPattern = /^\/api\/assets\/[^/?#]+\/content(?:\?[^#]*)?(?:#.*)?$/;
function isValidProfileImage(value) {
  if (profileImageAssetPathPattern.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
var profileImageSchema = external_exports.string().trim().min(1).max(4e3).refine(isValidProfileImage, { message: "Invalid profile image URL" });
var currentUserProfileSchema = external_exports.object({
  id: external_exports.string().min(1),
  email: external_exports.string().email().nullable(),
  name: external_exports.string().min(1).max(120).nullable(),
  image: profileImageSchema.nullable()
});
var authSessionSchema = external_exports.object({
  session: external_exports.object({
    id: external_exports.string().min(1),
    userId: external_exports.string().min(1)
  }),
  user: currentUserProfileSchema
});
var updateCurrentUserProfileSchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(120),
  image: external_exports.union([profileImageSchema, external_exports.literal(""), external_exports.null()]).optional().transform((value) => value === "" ? null : value)
});

// ../../external/sps-core/packages/shared/src/validators/sps-nodes.ts
var spsNodeCapabilitySchema = external_exports.object({
  kind: external_exports.enum([
    "claude_cli",
    "codex_cli",
    "agy_cli",
    "gemini_cli",
    "opencode_cli",
    "pi_cli",
    "ollama",
    "lm_studio",
    "specialist_api",
    "custom"
  ]),
  label: external_exports.string().trim().min(1).max(120),
  version: external_exports.string().trim().max(120).optional().nullable(),
  models: external_exports.array(external_exports.string().trim().min(1).max(160)).max(100).optional()
});
var spsNodeRunnerAvailabilityStatusSchema = external_exports.enum([
  "available",
  "busy",
  "quota_limited",
  "auth_required",
  "offline",
  "unknown"
]);
var spsNodeRunnerCredentialStatusSchema = external_exports.enum(["ready", "auth_required", "unknown"]);
var spsNodeRunnerAvailabilitySourceSchema = external_exports.enum(["node_probe", "adapter", "manual"]);
var spsNodeRunnerAvailabilitySchema = external_exports.object({
  status: spsNodeRunnerAvailabilityStatusSchema,
  observedAt: external_exports.string().datetime({ offset: true }),
  source: spsNodeRunnerAvailabilitySourceSchema,
  confidence: external_exports.number().int().min(0).max(100).optional().nullable(),
  retryAfter: external_exports.string().datetime({ offset: true }).optional().nullable(),
  detail: external_exports.string().trim().min(1).max(500).optional().nullable()
});
var spsNodeRunnerProfileSchema = spsNodeCapabilitySchema.extend({
  runnerKey: external_exports.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/),
  profileLabel: external_exports.string().trim().min(1).max(120).optional().nullable(),
  credentialStatus: spsNodeRunnerCredentialStatusSchema.optional(),
  availability: spsNodeRunnerAvailabilitySchema.optional()
});
var uniqueRunnerKeys = (profiles) => new Set(profiles.map((profile) => profile.runnerKey)).size === profiles.length;
var createSpsNodeSchema = external_exports.object({
  displayName: external_exports.string().trim().min(1).max(120),
  publicKey: external_exports.string().trim().min(32).max(8192),
  platform: external_exports.string().trim().min(1).max(120),
  appVersion: external_exports.string().trim().max(120).optional().nullable(),
  capabilities: external_exports.array(spsNodeCapabilitySchema).max(32).default([]),
  runners: external_exports.array(spsNodeRunnerProfileSchema).max(64).optional()
}).superRefine((value, context) => {
  if (value.runners && !uniqueRunnerKeys(value.runners)) {
    context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["runners"], message: "Runner keys must be unique per Node" });
  }
});
var updateSpsNodeStatusSchema = external_exports.object({
  status: external_exports.enum(["active", "revoked"])
});
var bindSpsAgentNodeSchema = external_exports.object({
  nodeId: external_exports.string().uuid()
});
var spsNodeHeartbeatSchema = external_exports.object({
  timestamp: external_exports.string().datetime({ offset: true }),
  nonce: external_exports.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  signature: external_exports.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(64).max(2048)
});
var spsNodeSignedRequestSchema = external_exports.object({
  timestamp: external_exports.string().datetime({ offset: true }),
  nonce: external_exports.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  signature: external_exports.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(64).max(2048)
});
var spsNodeCommandEventSchema = external_exports.object({
  sequence: external_exports.number().int().positive(),
  stream: external_exports.enum(["stdout", "stderr"]),
  body: external_exports.string().min(1).max(64 * 1024)
});
var spsNodeCommandCompleteSchema = external_exports.object({
  status: external_exports.enum(["succeeded", "failed"]),
  exitCode: external_exports.number().int().nullable(),
  signal: external_exports.string().trim().max(120).nullable().optional(),
  timedOut: external_exports.boolean().default(false),
  error: external_exports.string().trim().max(16e3).nullable().optional()
});
var reportSpsNodeRunnerAvailabilitySchema = external_exports.object({
  runners: external_exports.array(external_exports.object({
    runnerKey: external_exports.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/),
    credentialStatus: spsNodeRunnerCredentialStatusSchema.optional(),
    availability: spsNodeRunnerAvailabilitySchema
  })).min(1).max(64)
}).superRefine((value, context) => {
  if (!uniqueRunnerKeys(value.runners)) {
    context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["runners"], message: "Runner keys must be unique per Node" });
  }
});

// ../../external/sps-core/packages/shared/src/validators/plugin.ts
var jsonSchemaSchema = external_exports.record(external_exports.string(), external_exports.unknown()).refine(
  (val) => {
    if (Object.keys(val).length === 0) return true;
    return typeof val.type === "string" || val.$ref !== void 0 || val.oneOf !== void 0 || val.anyOf !== void 0 || val.allOf !== void 0;
  },
  { message: "Must be a valid JSON Schema object (requires at least a 'type', '$ref', or composition keyword)" }
);
var CRON_FIELD_PATTERN = /^(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?)(?:,(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?))*$/;
function isValidCronExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed) return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => CRON_FIELD_PATTERN.test(f));
}
var pluginJobDeclarationSchema = external_exports.object({
  jobKey: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  description: external_exports.string().optional(),
  schedule: external_exports.string().refine(
    (val) => isValidCronExpression(val),
    { message: "schedule must be a valid 5-field cron expression (e.g. '*/15 * * * *')" }
  ).optional()
});
var pluginWebhookDeclarationSchema = external_exports.object({
  endpointKey: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  description: external_exports.string().optional()
});
var pluginToolDeclarationSchema = external_exports.object({
  name: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  description: external_exports.string().min(1),
  parametersSchema: jsonSchemaSchema
});
var pluginEnvironmentTemplateConfigFieldSchema = external_exports.string().min(1).max(100).regex(
  /^[A-Za-z_][A-Za-z0-9_-]*$/,
  "Template config binding fields must be top-level config keys using letters, digits, underscores, or hyphens"
).refine((value) => value !== "provider", {
  message: "Template config binding must not replace the sandbox provider key"
});
var pluginEnvironmentTemplateConfigBindingSchema = external_exports.object({
  field: pluginEnvironmentTemplateConfigFieldSchema,
  unsetFields: external_exports.array(pluginEnvironmentTemplateConfigFieldSchema).max(20).optional()
}).strict().superRefine((value, ctx) => {
  const unsetFields = value.unsetFields ?? [];
  const seen = /* @__PURE__ */ new Set();
  for (const [index, field] of unsetFields.entries()) {
    if (field === value.field) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Template config binding cannot unset the same field it sets",
        path: ["unsetFields", index]
      });
    }
    if (seen.has(field)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Template config binding unsetFields must be unique",
        path: ["unsetFields", index]
      });
    }
    seen.add(field);
  }
});
var pluginEnvironmentDriverDeclarationSchema = external_exports.object({
  driverKey: external_exports.string().min(1).regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Environment driver key must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores"
  ),
  kind: external_exports.enum(["environment_driver", "sandbox_provider"]).optional(),
  displayName: external_exports.string().min(1).max(100),
  description: external_exports.string().max(500).optional(),
  supportsReusableLeases: external_exports.boolean().optional(),
  supportsInteractiveSetup: external_exports.boolean().optional(),
  interactiveSetupConnectionTypes: external_exports.array(external_exports.string().min(1).max(100)).max(10).optional(),
  supportsTemplateCapture: external_exports.boolean().optional(),
  templateRefKind: external_exports.string().min(1).max(100).optional(),
  templateConfigBinding: pluginEnvironmentTemplateConfigBindingSchema.optional(),
  templateIdentityPaths: external_exports.array(external_exports.string().min(1).max(200)).max(20).optional(),
  supportsTemplateDelete: external_exports.boolean().optional(),
  configSchema: jsonSchemaSchema
});
var pluginManagedAgentDeclarationSchema = external_exports.object({
  agentKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "agentKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  }),
  displayName: external_exports.string().min(1).max(100),
  role: external_exports.string().min(1).max(100).optional(),
  title: external_exports.string().max(200).nullable().optional(),
  icon: external_exports.string().max(100).nullable().optional(),
  capabilities: external_exports.string().max(2e3).nullable().optional(),
  adapterType: external_exports.string().min(1).max(100).optional(),
  adapterPreference: external_exports.array(external_exports.string().min(1).max(100)).max(10).optional(),
  adapterConfig: external_exports.record(external_exports.string(), external_exports.unknown()).optional(),
  runtimeConfig: external_exports.record(external_exports.string(), external_exports.unknown()).optional(),
  permissions: external_exports.record(external_exports.string(), external_exports.unknown()).optional(),
  status: external_exports.enum(["idle", "paused"]).optional(),
  budgetMonthlyCents: external_exports.number().int().min(0).optional(),
  instructions: external_exports.object({
    entryFile: external_exports.string().min(1).max(200).optional(),
    content: external_exports.string().max(2e5).optional(),
    files: external_exports.record(external_exports.string().max(2e5)).optional(),
    assetPath: external_exports.string().min(1).max(500).optional()
  }).optional()
});
var pluginManagedProjectDeclarationSchema = external_exports.object({
  projectKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "projectKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  }),
  displayName: external_exports.string().min(1).max(120),
  description: external_exports.string().max(2e3).nullable().optional(),
  status: external_exports.enum(["backlog", "planned", "in_progress", "completed", "cancelled"]).optional(),
  color: external_exports.string().max(32).nullable().optional(),
  settings: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
});
var pluginManagedResourceRefSchema = external_exports.object({
  pluginKey: external_exports.string().min(1).max(100).optional(),
  resourceKind: external_exports.enum(["agent", "project", "routine", "skill"]),
  resourceKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "resourceKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  })
});
var pluginManagedRoutineDeclarationSchema = external_exports.object({
  routineKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "routineKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  }),
  title: external_exports.string().trim().min(1).max(200),
  description: external_exports.string().max(1e4).nullable().optional(),
  assigneeRef: pluginManagedResourceRefSchema.extend({ resourceKind: external_exports.literal("agent") }).nullable().optional(),
  projectRef: pluginManagedResourceRefSchema.extend({ resourceKind: external_exports.literal("project") }).nullable().optional(),
  goalId: external_exports.string().uuid().nullable().optional(),
  status: external_exports.enum(ROUTINE_STATUSES).optional(),
  priority: external_exports.enum(ISSUE_PRIORITIES).optional(),
  concurrencyPolicy: external_exports.enum(ROUTINE_CONCURRENCY_POLICIES).optional(),
  catchUpPolicy: external_exports.enum(ROUTINE_CATCH_UP_POLICIES).optional(),
  variables: external_exports.array(routineVariableSchema).optional(),
  triggers: external_exports.array(external_exports.object({
    kind: external_exports.enum(ROUTINE_TRIGGER_KINDS),
    label: external_exports.string().trim().max(120).nullable().optional(),
    enabled: external_exports.boolean().optional(),
    cronExpression: external_exports.string().trim().min(1).optional().nullable(),
    timezone: external_exports.string().trim().min(1).optional().nullable(),
    signingMode: external_exports.enum(ROUTINE_TRIGGER_SIGNING_MODES).optional().nullable(),
    replayWindowSec: external_exports.number().int().min(30).max(86400).optional().nullable()
  })).max(20).optional(),
  issueTemplate: external_exports.object({
    surfaceVisibility: external_exports.enum(ISSUE_SURFACE_VISIBILITIES).optional(),
    originId: external_exports.string().trim().max(255).nullable().optional(),
    billingCode: external_exports.string().trim().max(200).nullable().optional()
  }).optional()
});
var pluginLocalFolderRelativePathSchema = external_exports.string().min(1).max(500).refine(
  (value) => !value.startsWith("/") && !value.includes("..") && !value.includes("\\") && !value.split("/").some((segment) => segment === "" || segment === "."),
  { message: "local folder paths must be relative paths without traversal, empty segments, or backslashes" }
);
var pluginLocalFolderDeclarationSchema = external_exports.object({
  folderKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "folderKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  }),
  displayName: external_exports.string().min(1).max(100),
  description: external_exports.string().max(500).optional(),
  access: external_exports.enum(["read", "readWrite"]).optional(),
  requiredDirectories: external_exports.array(pluginLocalFolderRelativePathSchema).optional(),
  requiredFiles: external_exports.array(pluginLocalFolderRelativePathSchema).optional()
});
var pluginManagedSkillFileDeclarationSchema = external_exports.object({
  path: pluginLocalFolderRelativePathSchema.refine(
    (value) => value.toLowerCase() !== "skill.md",
    { message: "managed skill files cannot replace SKILL.md; use markdown for the main skill file" }
  ),
  content: external_exports.string().max(2e5)
});
var pluginManagedSkillDeclarationSchema = external_exports.object({
  skillKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "skillKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  }),
  displayName: external_exports.string().min(1).max(100),
  slug: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "slug must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, colons, underscores, or hyphens"
  }).optional(),
  description: external_exports.string().max(2e3).nullable().optional(),
  markdown: external_exports.string().max(2e5).optional(),
  files: external_exports.array(pluginManagedSkillFileDeclarationSchema).max(50).optional()
}).superRefine((value, ctx) => {
  const paths = (value.files ?? []).map((file) => file.path);
  const duplicates = paths.filter((path3, index) => paths.indexOf(path3) !== index);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `Duplicate managed skill file paths: ${[...new Set(duplicates)].join(", ")}`,
      path: ["files"]
    });
  }
});
var pluginUiSlotDeclarationSchema = external_exports.object({
  type: external_exports.enum(PLUGIN_UI_SLOT_TYPES),
  id: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  exportName: external_exports.string().min(1),
  entityTypes: external_exports.array(external_exports.enum(PLUGIN_UI_SLOT_ENTITY_TYPES)).optional(),
  routePath: external_exports.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "routePath must be a lowercase single-segment slug (letters, numbers, hyphens)"
  }).optional(),
  order: external_exports.number().int().optional()
}).superRefine((value, ctx) => {
  const entityScopedTypes = ["detailTab", "taskDetailView", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "projectSidebarItem"];
  if (entityScopedTypes.includes(value.type) && (!value.entityTypes || value.entityTypes.length === 0)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `${value.type} slots require at least one entityType`,
      path: ["entityTypes"]
    });
  }
  if (value.type === "projectSidebarItem" && value.entityTypes && !value.entityTypes.includes("project")) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: 'projectSidebarItem slots require entityTypes to include "project"',
      path: ["entityTypes"]
    });
  }
  if (value.type === "commentAnnotation" && value.entityTypes && !value.entityTypes.includes("comment")) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: 'commentAnnotation slots require entityTypes to include "comment"',
      path: ["entityTypes"]
    });
  }
  if (value.type === "commentContextMenuItem" && value.entityTypes && !value.entityTypes.includes("comment")) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: 'commentContextMenuItem slots require entityTypes to include "comment"',
      path: ["entityTypes"]
    });
  }
  if (value.routePath && value.type !== "page" && value.type !== "routeSidebar" && value.type !== "companySettingsPage") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "routePath is only supported for page, routeSidebar, and companySettingsPage slots",
      path: ["routePath"]
    });
  }
  if (value.type === "routeSidebar" && !value.routePath) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "routeSidebar slots require routePath",
      path: ["routePath"]
    });
  }
  if (value.type === "companySettingsPage" && !value.routePath) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "companySettingsPage slots require routePath",
      path: ["routePath"]
    });
  }
  if (value.routePath && PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS.includes(value.routePath)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `routePath "${value.routePath}" is reserved by the host`,
      path: ["routePath"]
    });
  }
  if (value.type === "companySettingsPage" && value.routePath && PLUGIN_RESERVED_COMPANY_SETTINGS_ROUTE_SEGMENTS.includes(value.routePath)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `company settings routePath "${value.routePath}" is reserved by the host`,
      path: ["routePath"]
    });
  }
});
var entityScopedLauncherPlacementZones = [
  "detailTab",
  "taskDetailView",
  "contextMenuItem",
  "commentAnnotation",
  "commentContextMenuItem",
  "projectSidebarItem"
];
var launcherBoundsByEnvironment = {
  hostInline: ["inline", "compact", "default"],
  hostOverlay: ["compact", "default", "wide", "full"],
  hostRoute: ["default", "wide", "full"],
  external: [],
  iframe: ["compact", "default", "wide", "full"]
};
var pluginLauncherActionDeclarationSchema = external_exports.object({
  type: external_exports.enum(PLUGIN_LAUNCHER_ACTIONS),
  target: external_exports.string().min(1),
  params: external_exports.record(external_exports.string(), external_exports.unknown()).optional()
}).superRefine((value, ctx) => {
  if (value.type === "performAction" && value.target.includes("/")) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "performAction launchers must target an action key, not a route or URL",
      path: ["target"]
    });
  }
  if (value.type === "navigate" && /^https?:\/\//.test(value.target)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "navigate launchers must target a host route, not an absolute URL",
      path: ["target"]
    });
  }
});
var pluginLauncherRenderDeclarationSchema = external_exports.object({
  environment: external_exports.enum(PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS),
  bounds: external_exports.enum(PLUGIN_LAUNCHER_BOUNDS).optional()
}).superRefine((value, ctx) => {
  if (!value.bounds) {
    return;
  }
  const supportedBounds = launcherBoundsByEnvironment[value.environment];
  if (!supportedBounds.includes(value.bounds)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `bounds "${value.bounds}" is not supported for render environment "${value.environment}"`,
      path: ["bounds"]
    });
  }
});
var pluginLauncherDeclarationSchema = external_exports.object({
  id: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  description: external_exports.string().optional(),
  placementZone: external_exports.enum(PLUGIN_LAUNCHER_PLACEMENT_ZONES),
  exportName: external_exports.string().min(1).optional(),
  entityTypes: external_exports.array(external_exports.enum(PLUGIN_UI_SLOT_ENTITY_TYPES)).optional(),
  order: external_exports.number().int().optional(),
  action: pluginLauncherActionDeclarationSchema,
  render: pluginLauncherRenderDeclarationSchema.optional()
}).superRefine((value, ctx) => {
  if (entityScopedLauncherPlacementZones.some((zone) => zone === value.placementZone) && (!value.entityTypes || value.entityTypes.length === 0)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `${value.placementZone} launchers require at least one entityType`,
      path: ["entityTypes"]
    });
  }
  if (value.placementZone === "projectSidebarItem" && value.entityTypes && !value.entityTypes.includes("project")) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: 'projectSidebarItem launchers require entityTypes to include "project"',
      path: ["entityTypes"]
    });
  }
  if (value.action.type === "performAction" && value.render) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "performAction launchers cannot declare render hints",
      path: ["render"]
    });
  }
  if (["openModal", "openDrawer", "openPopover"].includes(value.action.type) && !value.render) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `${value.action.type} launchers require render metadata`,
      path: ["render"]
    });
  }
  if (value.action.type === "openModal" && value.render?.environment === "hostInline") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "openModal launchers cannot use the hostInline render environment",
      path: ["render", "environment"]
    });
  }
  if (value.action.type === "openDrawer" && value.render && !["hostOverlay", "iframe"].includes(value.render.environment)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "openDrawer launchers must use hostOverlay or iframe render environments",
      path: ["render", "environment"]
    });
  }
  if (value.action.type === "openPopover" && value.render?.environment === "hostRoute") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "openPopover launchers cannot use the hostRoute render environment",
      path: ["render", "environment"]
    });
  }
});
var pluginDatabaseDeclarationSchema = external_exports.object({
  namespaceSlug: external_exports.string().regex(/^[a-z0-9][a-z0-9_]*$/, {
    message: "namespaceSlug must be lowercase letters, digits, or underscores and start with a letter or digit"
  }).max(40).optional(),
  migrationsDir: external_exports.string().min(1).refine(
    (value) => !value.startsWith("/") && !value.includes("..") && !/[\\]/.test(value),
    { message: "migrationsDir must be a relative package path without '..' or backslashes" }
  ),
  coreReadTables: external_exports.array(external_exports.enum(PLUGIN_DATABASE_CORE_READ_TABLES)).optional()
});
var pluginApiRouteDeclarationSchema = external_exports.object({
  routeKey: external_exports.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/, {
    message: "routeKey must be lowercase letters, digits, dots, colons, underscores, or hyphens"
  }),
  method: external_exports.enum(PLUGIN_API_ROUTE_METHODS),
  path: external_exports.string().min(1).regex(/^\/[a-zA-Z0-9:_./-]*$/, {
    message: "path must start with / and contain only path-safe literal or :param segments"
  }).refine(
    (value) => !value.includes("..") && !value.includes("//") && value !== "/api" && !value.startsWith("/api/") && value !== "/plugins" && !value.startsWith("/plugins/"),
    { message: "path must stay inside the plugin api namespace" }
  ),
  auth: external_exports.enum(PLUGIN_API_ROUTE_AUTH_MODES),
  capability: external_exports.literal("api.routes.register"),
  checkoutPolicy: external_exports.enum(PLUGIN_API_ROUTE_CHECKOUT_POLICIES).optional(),
  companyResolution: external_exports.discriminatedUnion("from", [
    external_exports.object({ from: external_exports.literal("body"), key: external_exports.string().min(1) }),
    external_exports.object({ from: external_exports.literal("query"), key: external_exports.string().min(1) }),
    external_exports.object({ from: external_exports.literal("issue"), param: external_exports.string().min(1) })
  ]).optional()
});
var pluginObjectReferenceRefreshPolicySchema = external_exports.object({
  defaultTtlSeconds: external_exports.number().int().positive().max(86400).optional(),
  staleAfterSeconds: external_exports.number().int().positive().max(604800).optional()
}).superRefine((value, ctx) => {
  if (value.defaultTtlSeconds != null && value.staleAfterSeconds != null && value.staleAfterSeconds < value.defaultTtlSeconds) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "staleAfterSeconds must be greater than or equal to defaultTtlSeconds",
      path: ["staleAfterSeconds"]
    });
  }
});
var pluginObjectReferenceProviderDeclarationSchema = external_exports.object({
  providerKey: externalObjectProviderKeySchema,
  displayName: external_exports.string().min(1).max(100),
  objectTypes: external_exports.array(externalObjectTypeSchema).min(1),
  urlPatterns: external_exports.array(external_exports.string().trim().min(1).max(500)).optional(),
  refreshPolicy: pluginObjectReferenceRefreshPolicySchema.optional(),
  webhookEndpointKeys: external_exports.array(external_exports.string().min(1)).optional()
}).superRefine((value, ctx) => {
  const duplicateObjectTypes = value.objectTypes.filter((type, i) => value.objectTypes.indexOf(type) !== i);
  if (duplicateObjectTypes.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `Duplicate objectTypes: ${[...new Set(duplicateObjectTypes)].join(", ")}`,
      path: ["objectTypes"]
    });
  }
  const webhookKeys = value.webhookEndpointKeys ?? [];
  const duplicateWebhookKeys = webhookKeys.filter((key, i) => webhookKeys.indexOf(key) !== i);
  if (duplicateWebhookKeys.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `Duplicate webhookEndpointKeys: ${[...new Set(duplicateWebhookKeys)].join(", ")}`,
      path: ["webhookEndpointKeys"]
    });
  }
});
var pluginMemoryProviderDeclarationSchema = external_exports.object({
  providerKey: external_exports.string().min(1).max(100).regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Memory provider key must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores"
  ),
  displayName: external_exports.string().min(1).max(100),
  scopes: external_exports.array(external_exports.enum(PLUGIN_MEMORY_SCOPES)).min(1),
  lifecycleEvents: external_exports.array(external_exports.enum(PLUGIN_MEMORY_LIFECYCLE_EVENTS)).optional(),
  recallToolName: external_exports.string().min(1).max(100).optional(),
  proposeToolName: external_exports.string().min(1).max(100).optional(),
  defaultForNewCompanies: external_exports.boolean().optional()
}).superRefine((value, ctx) => {
  const duplicateScopes = value.scopes.filter((scope, index) => value.scopes.indexOf(scope) !== index);
  if (duplicateScopes.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `Duplicate memory scopes: ${[...new Set(duplicateScopes)].join(", ")}`,
      path: ["scopes"]
    });
  }
  const lifecycleEvents = value.lifecycleEvents ?? [];
  const duplicateEvents = lifecycleEvents.filter((event, index) => lifecycleEvents.indexOf(event) !== index);
  if (duplicateEvents.length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `Duplicate memory lifecycle events: ${[...new Set(duplicateEvents)].join(", ")}`,
      path: ["lifecycleEvents"]
    });
  }
});
var pluginAgentPlatformDeclarationSchema = external_exports.object({
  contractVersion: external_exports.string().min(1).regex(
    /^\d+\.\d+(?:\.\d+)?$/,
    "Agent Platform contractVersion must use a numeric version such as 1.0"
  ),
  kind: agentPlatformExtensionKindSchema,
  profileKey: external_exports.string().min(1).max(100).regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Agent Platform profileKey must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores"
  ).optional()
}).superRefine((value, ctx) => {
  if (!isAgentPlatformContractCompatible(value.contractVersion)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: `Agent Platform contractVersion '${value.contractVersion}' is not compatible with this Core`,
      path: ["contractVersion"]
    });
  }
  if (value.kind === "workplane" && !value.profileKey) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "Agent Platform workplane extensions require a profileKey",
      path: ["profileKey"]
    });
  }
});
var pluginManifestV1Schema = external_exports.object({
  id: external_exports.string().min(1).regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Plugin id must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores"
  ),
  apiVersion: external_exports.literal(1),
  version: external_exports.string().min(1).regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    "Version must follow semver (e.g. 1.0.0 or 1.0.0-beta.1)"
  ),
  displayName: external_exports.string().min(1).max(100),
  description: external_exports.string().min(1).max(500),
  author: external_exports.string().min(1).max(200),
  categories: external_exports.array(external_exports.enum(PLUGIN_CATEGORIES)).min(1),
  minimumHostVersion: external_exports.string().regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    "minimumHostVersion must follow semver (e.g. 1.0.0)"
  ).optional(),
  minimumPaperclipVersion: external_exports.string().regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    "minimumPaperclipVersion must follow semver (e.g. 1.0.0)"
  ).optional(),
  capabilities: external_exports.array(external_exports.enum(PLUGIN_CAPABILITIES)).min(1),
  entrypoints: external_exports.object({
    worker: external_exports.string().min(1),
    ui: external_exports.string().min(1).optional()
  }),
  instanceConfigSchema: jsonSchemaSchema.optional(),
  jobs: external_exports.array(pluginJobDeclarationSchema).optional(),
  webhooks: external_exports.array(pluginWebhookDeclarationSchema).optional(),
  tools: external_exports.array(pluginToolDeclarationSchema).optional(),
  agentToolAccess: external_exports.enum(["company_default", "explicit_grant"]).optional(),
  database: pluginDatabaseDeclarationSchema.optional(),
  apiRoutes: external_exports.array(pluginApiRouteDeclarationSchema).optional(),
  environmentDrivers: external_exports.array(pluginEnvironmentDriverDeclarationSchema).optional(),
  agents: external_exports.array(pluginManagedAgentDeclarationSchema).optional(),
  projects: external_exports.array(pluginManagedProjectDeclarationSchema).optional(),
  routines: external_exports.array(pluginManagedRoutineDeclarationSchema).optional(),
  skills: external_exports.array(pluginManagedSkillDeclarationSchema).optional(),
  localFolders: external_exports.array(pluginLocalFolderDeclarationSchema).optional(),
  objectReferences: external_exports.array(pluginObjectReferenceProviderDeclarationSchema).optional(),
  memoryProvider: pluginMemoryProviderDeclarationSchema.optional(),
  agentPlatform: pluginAgentPlatformDeclarationSchema.optional(),
  launchers: external_exports.array(pluginLauncherDeclarationSchema).optional(),
  ui: external_exports.object({
    slots: external_exports.array(pluginUiSlotDeclarationSchema).min(1).optional(),
    launchers: external_exports.array(pluginLauncherDeclarationSchema).optional()
  }).optional()
}).superRefine((manifest, ctx) => {
  const hasUiSlots = (manifest.ui?.slots?.length ?? 0) > 0;
  const hasUiLaunchers = (manifest.ui?.launchers?.length ?? 0) > 0;
  if ((hasUiSlots || hasUiLaunchers) && !manifest.entrypoints.ui) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "entrypoints.ui is required when ui.slots or ui.launchers are declared",
      path: ["entrypoints", "ui"]
    });
  }
  if (manifest.minimumHostVersion && manifest.minimumPaperclipVersion && manifest.minimumHostVersion !== manifest.minimumPaperclipVersion) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "minimumHostVersion and minimumPaperclipVersion must match when both are declared",
      path: ["minimumHostVersion"]
    });
  }
  if (manifest.tools && manifest.tools.length > 0) {
    if (!manifest.capabilities.includes("agent.tools.register")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'agent.tools.register' is required when tools are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.environmentDrivers && manifest.environmentDrivers.length > 0) {
    if (!manifest.capabilities.includes("environment.drivers.register")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'environment.drivers.register' is required when environmentDrivers are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.agents && manifest.agents.length > 0) {
    if (!manifest.capabilities.includes("agents.managed")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'agents.managed' is required when managed agents are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.projects && manifest.projects.length > 0) {
    if (!manifest.capabilities.includes("projects.managed")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'projects.managed' is required when managed projects are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.routines && manifest.routines.length > 0) {
    if (!manifest.capabilities.includes("routines.managed")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'routines.managed' is required when managed routines are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.skills && manifest.skills.length > 0) {
    if (!manifest.capabilities.includes("skills.managed")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'skills.managed' is required when managed skills are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.localFolders && manifest.localFolders.length > 0) {
    if (!manifest.capabilities.includes("local.folders")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'local.folders' is required when local folders are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.jobs && manifest.jobs.length > 0) {
    if (!manifest.capabilities.includes("jobs.schedule")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'jobs.schedule' is required when jobs are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.webhooks && manifest.webhooks.length > 0) {
    if (!manifest.capabilities.includes("webhooks.receive")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'webhooks.receive' is required when webhooks are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.apiRoutes && manifest.apiRoutes.length > 0) {
    if (!manifest.capabilities.includes("api.routes.register")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'api.routes.register' is required when apiRoutes are declared",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.objectReferences && manifest.objectReferences.length > 0) {
    for (const capability of ["external.objects.detect", "external.objects.read"]) {
      if (!manifest.capabilities.includes(capability)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: `Capability '${capability}' is required when objectReferences are declared`,
          path: ["capabilities"]
        });
      }
    }
    const declaredWebhookKeys = new Set((manifest.webhooks ?? []).map((webhook) => webhook.endpointKey));
    for (const [providerIndex, provider] of manifest.objectReferences.entries()) {
      for (const endpointKey of provider.webhookEndpointKeys ?? []) {
        if (!declaredWebhookKeys.has(endpointKey)) {
          ctx.addIssue({
            code: external_exports.ZodIssueCode.custom,
            message: `objectReferences webhookEndpointKey "${endpointKey}" must match a declared webhook endpoint`,
            path: ["objectReferences", providerIndex, "webhookEndpointKeys"]
          });
        }
      }
    }
  }
  if (manifest.memoryProvider) {
    if (!manifest.capabilities.includes("memory.providers.register")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'memory.providers.register' is required when memoryProvider is declared",
        path: ["capabilities"]
      });
    }
    const declaredToolNames = new Set((manifest.tools ?? []).map((tool) => tool.name));
    for (const field of ["recallToolName", "proposeToolName"]) {
      const toolName = manifest.memoryProvider[field];
      if (toolName && !declaredToolNames.has(toolName)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: `memoryProvider.${field} must reference a declared tool`,
          path: ["memoryProvider", field]
        });
      }
    }
    if ((manifest.memoryProvider.recallToolName || manifest.memoryProvider.proposeToolName) && !manifest.capabilities.includes("agent.tools.register")) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: "Capability 'agent.tools.register' is required when memoryProvider declares agent tools",
        path: ["capabilities"]
      });
    }
  }
  if (manifest.database) {
    const requiredCapabilities = [
      "database.namespace.migrate",
      "database.namespace.read"
    ];
    for (const capability of requiredCapabilities) {
      if (!manifest.capabilities.includes(capability)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: `Capability '${capability}' is required when database migrations are declared`,
          path: ["capabilities"]
        });
      }
    }
    const coreReadTables = manifest.database.coreReadTables ?? [];
    const duplicates = coreReadTables.filter((table, i) => coreReadTables.indexOf(table) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate database coreReadTables: ${[...new Set(duplicates)].join(", ")}`,
        path: ["database", "coreReadTables"]
      });
    }
  }
  if (manifest.jobs) {
    const jobKeys = manifest.jobs.map((j) => j.jobKey);
    const duplicates = jobKeys.filter((key, i) => jobKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate job keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["jobs"]
      });
    }
  }
  if (manifest.webhooks) {
    const endpointKeys = manifest.webhooks.map((w) => w.endpointKey);
    const duplicates = endpointKeys.filter((key, i) => endpointKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate webhook endpoint keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["webhooks"]
      });
    }
  }
  if (manifest.apiRoutes) {
    const routeKeys = manifest.apiRoutes.map((route) => route.routeKey);
    const duplicateKeys = routeKeys.filter((key, i) => routeKeys.indexOf(key) !== i);
    if (duplicateKeys.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate api route keys: ${[...new Set(duplicateKeys)].join(", ")}`,
        path: ["apiRoutes"]
      });
    }
    const routeSignatures = manifest.apiRoutes.map((route) => `${route.method} ${route.path}`);
    const duplicateRoutes = routeSignatures.filter((sig, i) => routeSignatures.indexOf(sig) !== i);
    if (duplicateRoutes.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate api routes: ${[...new Set(duplicateRoutes)].join(", ")}`,
        path: ["apiRoutes"]
      });
    }
  }
  if (manifest.tools) {
    const toolNames = manifest.tools.map((t) => t.name);
    const duplicates = toolNames.filter((name, i) => toolNames.indexOf(name) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate tool names: ${[...new Set(duplicates)].join(", ")}`,
        path: ["tools"]
      });
    }
  }
  if (manifest.environmentDrivers) {
    const driverKeys = manifest.environmentDrivers.map((d) => d.driverKey);
    const duplicates = driverKeys.filter((key, i) => driverKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate environment driver keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["environmentDrivers"]
      });
    }
  }
  if (manifest.localFolders) {
    const folderKeys = manifest.localFolders.map((folder) => folder.folderKey);
    const duplicates = folderKeys.filter((key, i) => folderKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate local folder keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["localFolders"]
      });
    }
  }
  if (manifest.agents) {
    const agentKeys = manifest.agents.map((agent) => agent.agentKey);
    const duplicates = agentKeys.filter((key, i) => agentKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate managed agent keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["agents"]
      });
    }
  }
  if (manifest.projects) {
    const projectKeys = manifest.projects.map((project) => project.projectKey);
    const duplicates = projectKeys.filter((key, i) => projectKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate managed project keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["projects"]
      });
    }
  }
  if (manifest.routines) {
    const routineKeys = manifest.routines.map((routine) => routine.routineKey);
    const duplicates = routineKeys.filter((key, i) => routineKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate managed routine keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["routines"]
      });
    }
  }
  if (manifest.skills) {
    const skillKeys = manifest.skills.map((skill) => skill.skillKey);
    const duplicates = skillKeys.filter((key, i) => skillKeys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate managed skill keys: ${[...new Set(duplicates)].join(", ")}`,
        path: ["skills"]
      });
    }
  }
  if (manifest.objectReferences) {
    const providerKeys = manifest.objectReferences.map((provider) => provider.providerKey);
    const duplicateProviders = providerKeys.filter((key, i) => providerKeys.indexOf(key) !== i);
    if (duplicateProviders.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate object reference provider keys: ${[...new Set(duplicateProviders)].join(", ")}`,
        path: ["objectReferences"]
      });
    }
  }
  if (manifest.ui) {
    if (manifest.ui.slots) {
      const slotIds = manifest.ui.slots.map((s) => s.id);
      const duplicates = slotIds.filter((id, i) => slotIds.indexOf(id) !== i);
      if (duplicates.length > 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: `Duplicate UI slot ids: ${[...new Set(duplicates)].join(", ")}`,
          path: ["ui", "slots"]
        });
      }
    }
  }
  const allLaunchers = [
    ...manifest.launchers ?? [],
    ...manifest.ui?.launchers ?? []
  ];
  if (allLaunchers.length > 0) {
    const launcherIds = allLaunchers.map((launcher) => launcher.id);
    const duplicates = launcherIds.filter((id, i) => launcherIds.indexOf(id) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        message: `Duplicate launcher ids: ${[...new Set(duplicates)].join(", ")}`,
        path: manifest.ui?.launchers ? ["ui", "launchers"] : ["launchers"]
      });
    }
  }
});
var installPluginSchema = external_exports.object({
  packageName: external_exports.string().min(1),
  version: external_exports.string().min(1).optional(),
  /** Set by loader for local-path installs so the worker can be resolved. */
  packagePath: external_exports.string().min(1).optional()
});
var upsertPluginConfigSchema = external_exports.object({
  configJson: external_exports.record(external_exports.string(), external_exports.unknown())
});
var patchPluginConfigSchema = external_exports.object({
  configJson: external_exports.record(external_exports.string(), external_exports.unknown())
});
var updatePluginStatusSchema = external_exports.object({
  status: external_exports.enum(PLUGIN_STATUSES),
  lastError: external_exports.string().nullable().optional()
});
var uninstallPluginSchema = external_exports.object({
  removeData: external_exports.boolean().optional().default(false)
});
var pluginStateScopeKeySchema = external_exports.object({
  scopeKind: external_exports.enum(PLUGIN_STATE_SCOPE_KINDS),
  scopeId: external_exports.string().min(1).optional(),
  namespace: external_exports.string().min(1).optional(),
  stateKey: external_exports.string().min(1)
});
var setPluginStateSchema = external_exports.object({
  scopeKind: external_exports.enum(PLUGIN_STATE_SCOPE_KINDS),
  scopeId: external_exports.string().min(1).optional(),
  namespace: external_exports.string().min(1).optional(),
  stateKey: external_exports.string().min(1),
  /** JSON-serializable value to store. */
  value: external_exports.unknown()
});
var listPluginStateSchema = external_exports.object({
  scopeKind: external_exports.enum(PLUGIN_STATE_SCOPE_KINDS).optional(),
  scopeId: external_exports.string().min(1).optional(),
  namespace: external_exports.string().min(1).optional()
});

// ../../external/sps-core/packages/shared/src/api.ts
var API_PREFIX = "/api";
var API = {
  health: `${API_PREFIX}/health`,
  companies: `${API_PREFIX}/companies`,
  agents: `${API_PREFIX}/agents`,
  projects: `${API_PREFIX}/projects`,
  environments: `${API_PREFIX}/environments`,
  environmentDeleteBlastRadius: `${API_PREFIX}/environments/:id/delete-blast-radius`,
  environmentCustomImageTemplate: `${API_PREFIX}/environments/:environmentId/custom-image-template`,
  environmentCustomImageTemplateDisable: `${API_PREFIX}/environments/:environmentId/custom-image-template`,
  environmentCustomImageTemplateRollback: `${API_PREFIX}/environments/:environmentId/custom-image-template/rollback`,
  environmentCustomImageSetupSessions: `${API_PREFIX}/environments/:environmentId/custom-image-setup-sessions`,
  environmentCustomImageSetupSession: `${API_PREFIX}/environment-custom-image-setup-sessions/:sessionId`,
  environmentCustomImageSetupSessionTerminalToken: `${API_PREFIX}/environment-custom-image-setup-sessions/:sessionId/terminal-session-token`,
  environmentCustomImageSetupSessionTerminalWs: `${API_PREFIX}/environment-custom-image-setup-sessions/:sessionId/terminal/ws`,
  environmentCustomImageSetupSessionFinish: `${API_PREFIX}/environment-custom-image-setup-sessions/:sessionId/finish`,
  environmentCustomImageSetupSessionCancel: `${API_PREFIX}/environment-custom-image-setup-sessions/:sessionId/cancel`,
  issues: `${API_PREFIX}/issues`,
  issueWatchdog: `${API_PREFIX}/issues/:issueId/watchdog`,
  issueTreeControl: `${API_PREFIX}/issues/:issueId/tree-control`,
  issueTreeHolds: `${API_PREFIX}/issues/:issueId/tree-holds`,
  goals: `${API_PREFIX}/goals`,
  approvals: `${API_PREFIX}/approvals`,
  secrets: `${API_PREFIX}/secrets`,
  userSecretDefinitions: `${API_PREFIX}/companies/:companyId/user-secret-definitions`,
  userSecretDefinition: `${API_PREFIX}/companies/:companyId/user-secret-definitions/:definitionId`,
  userSecretDefinitionCoverage: `${API_PREFIX}/companies/:companyId/user-secret-definitions/:definitionId/coverage`,
  myUserSecrets: `${API_PREFIX}/companies/:companyId/me/user-secrets`,
  myUserSecret: `${API_PREFIX}/companies/:companyId/me/user-secrets/:secretId`,
  secretProviderConfigs: `${API_PREFIX}/secret-provider-configs`,
  secretProviderConfigDiscoveryPreview: `${API_PREFIX}/companies/:companyId/secret-provider-configs/discovery/preview`,
  costs: `${API_PREFIX}/costs`,
  activity: `${API_PREFIX}/activity`,
  dashboard: `${API_PREFIX}/dashboard`,
  sidebarBadges: `${API_PREFIX}/sidebar-badges`,
  sidebarPreferences: `${API_PREFIX}/sidebar-preferences`,
  resourceMemberships: `${API_PREFIX}/resource-memberships`,
  invites: `${API_PREFIX}/invites`,
  joinRequests: `${API_PREFIX}/join-requests`,
  members: `${API_PREFIX}/members`,
  admin: `${API_PREFIX}/admin`
};

// ../../external/sps-core/packages/shared/src/config-schema.ts
var configMetaSchema = external_exports.object({
  version: external_exports.literal(1),
  updatedAt: external_exports.string(),
  source: external_exports.enum(["onboard", "configure", "doctor"])
});
var llmConfigSchema = external_exports.object({
  provider: external_exports.enum(["claude", "openai"]),
  apiKey: external_exports.string().optional()
});
var databaseBackupConfigSchema = external_exports.object({
  enabled: external_exports.boolean().default(true),
  intervalMinutes: external_exports.number().int().min(1).max(7 * 24 * 60).default(60),
  retentionDays: external_exports.number().int().min(1).max(3650).default(7),
  dir: external_exports.string().default("~/.paperclip/instances/default/data/backups")
});
var databaseConfigSchema = external_exports.object({
  mode: external_exports.enum(["embedded-postgres", "postgres"]).default("embedded-postgres"),
  connectionString: external_exports.string().optional(),
  embeddedPostgresDataDir: external_exports.string().default("~/.paperclip/instances/default/db"),
  embeddedPostgresPort: external_exports.number().int().min(1).max(65535).default(54329),
  backup: databaseBackupConfigSchema.default({
    enabled: true,
    intervalMinutes: 60,
    retentionDays: 7,
    dir: "~/.paperclip/instances/default/data/backups"
  })
});
var loggingConfigSchema = external_exports.object({
  mode: external_exports.enum(["file", "cloud"]),
  logDir: external_exports.string().default("~/.paperclip/instances/default/logs")
});
var serverConfigSchema = external_exports.object({
  deploymentMode: external_exports.enum(DEPLOYMENT_MODES).default("local_trusted"),
  exposure: external_exports.enum(DEPLOYMENT_EXPOSURES).default("private"),
  bind: external_exports.enum(BIND_MODES).optional(),
  customBindHost: external_exports.string().optional(),
  host: external_exports.string().default("127.0.0.1"),
  port: external_exports.number().int().min(1).max(65535).default(3100),
  allowedHostnames: external_exports.array(external_exports.string().min(1)).default([]),
  serveUi: external_exports.boolean().default(true)
});
var authConfigSchema = external_exports.object({
  baseUrlMode: external_exports.enum(AUTH_BASE_URL_MODES).default("auto"),
  publicBaseUrl: external_exports.string().url().optional(),
  disableSignUp: external_exports.boolean().default(false)
});
var storageLocalDiskConfigSchema = external_exports.object({
  baseDir: external_exports.string().default("~/.paperclip/instances/default/data/storage")
});
var storageS3ConfigSchema = external_exports.object({
  bucket: external_exports.string().min(1).default("paperclip"),
  region: external_exports.string().min(1).default("us-east-1"),
  endpoint: external_exports.string().optional(),
  prefix: external_exports.string().default(""),
  forcePathStyle: external_exports.boolean().default(false)
});
var storageConfigSchema = external_exports.object({
  provider: external_exports.enum(STORAGE_PROVIDERS).default("local_disk"),
  localDisk: storageLocalDiskConfigSchema.default({
    baseDir: "~/.paperclip/instances/default/data/storage"
  }),
  s3: storageS3ConfigSchema.default({
    bucket: "paperclip",
    region: "us-east-1",
    prefix: "",
    forcePathStyle: false
  })
});
var secretsLocalEncryptedConfigSchema = external_exports.object({
  keyFilePath: external_exports.string().default("~/.paperclip/instances/default/secrets/master.key")
});
var secretsConfigSchema = external_exports.object({
  provider: external_exports.enum(SECRET_PROVIDERS).default("local_encrypted"),
  strictMode: external_exports.boolean().default(false),
  localEncrypted: secretsLocalEncryptedConfigSchema.default({
    keyFilePath: "~/.paperclip/instances/default/secrets/master.key"
  })
});
var telemetryConfigSchema = external_exports.object({
  enabled: external_exports.boolean().default(true)
}).default({});
var paperclipConfigSchema = external_exports.object({
  $meta: configMetaSchema,
  llm: llmConfigSchema.optional(),
  database: databaseConfigSchema,
  logging: loggingConfigSchema,
  server: serverConfigSchema,
  telemetry: telemetryConfigSchema,
  auth: authConfigSchema.default({
    baseUrlMode: "auto",
    disableSignUp: false
  }),
  storage: storageConfigSchema.default({
    provider: "local_disk",
    localDisk: {
      baseDir: "~/.paperclip/instances/default/data/storage"
    },
    s3: {
      bucket: "paperclip",
      region: "us-east-1",
      prefix: "",
      forcePathStyle: false
    }
  }),
  secrets: secretsConfigSchema.default({
    provider: "local_encrypted",
    strictMode: false,
    localEncrypted: {
      keyFilePath: "~/.paperclip/instances/default/secrets/master.key"
    }
  })
}).superRefine((value, ctx) => {
  if (value.server.deploymentMode === "local_trusted" && value.server.exposure !== "private") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "server.exposure must be private when deploymentMode is local_trusted",
      path: ["server", "exposure"]
    });
  }
  for (const message of validateConfiguredBindMode({
    deploymentMode: value.server.deploymentMode,
    deploymentExposure: value.server.exposure,
    bind: value.server.bind,
    host: value.server.host,
    customBindHost: value.server.customBindHost
  })) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message,
      path: message.includes("customBindHost") ? ["server", "customBindHost"] : ["server", "bind"]
    });
  }
  if (value.auth.baseUrlMode === "explicit" && !value.auth.publicBaseUrl) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "auth.publicBaseUrl is required when auth.baseUrlMode is explicit",
      path: ["auth", "publicBaseUrl"]
    });
  }
  if (value.server.exposure === "public" && value.auth.baseUrlMode !== "explicit") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "auth.baseUrlMode must be explicit when deploymentMode=authenticated and exposure=public",
      path: ["auth", "baseUrlMode"]
    });
  }
  if (value.server.exposure === "public" && !value.auth.publicBaseUrl) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "auth.publicBaseUrl is required when deploymentMode=authenticated and exposure=public",
      path: ["auth", "publicBaseUrl"]
    });
  }
});

// ../../external/sps-core/packages/shared/src/validators/adapter-registry.ts
var adapterRegistryEntrySchema = external_exports.object({
  adapterType: external_exports.string().min(1),
  enabled: external_exports.boolean().default(true),
  runtimeImage: external_exports.string().optional(),
  envKeys: external_exports.array(external_exports.string()).optional(),
  allowFqdns: external_exports.array(external_exports.string()).optional(),
  probeCommand: external_exports.array(external_exports.string()).optional(),
  defaultEnv: external_exports.record(external_exports.string()).optional()
}).strict();
var adapterRegistrySchema = external_exports.array(adapterRegistryEntrySchema);

// ../../external/sps-core/packages/plugins/sdk/dist/platform-client.js
function scopeForSession(session, organizationId) {
  return normalizeAgentPlatformScope({
    organizationId,
    projectId: session.context?.projectId ?? null,
    workItemId: session.context?.issueId ?? null,
    threadId: session.sessionId,
    agentId: session.agentId
  });
}
function toThread(session, organizationId) {
  return {
    id: session.sessionId,
    scope: scopeForSession(session, organizationId),
    agentId: session.agentId,
    status: session.status === "closed" ? "closed" : "active",
    backendId: null,
    lastRunId: session.lastRunId,
    lastError: session.lastError,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt ?? session.createdAt
  };
}
function platformScopeToStateScope(scope) {
  const normalized = normalizeAgentPlatformScope(scope);
  if (normalized.threadId)
    return { scopeKind: "thread", scopeId: normalized.threadId };
  if (normalized.workItemId)
    return { scopeKind: "issue", scopeId: normalized.workItemId };
  if (normalized.agentId)
    return { scopeKind: "agent", scopeId: normalized.agentId };
  if (normalized.projectId)
    return { scopeKind: "project", scopeId: normalized.projectId };
  return { scopeKind: "company", scopeId: normalized.organizationId };
}
function createPluginPlatformClient(deps) {
  return {
    contractVersion: AGENT_PLATFORM_CONTRACT_VERSION,
    threads: {
      async create(input) {
        const scope = normalizeAgentPlatformScope(input.scope);
        const session = await deps.agents.sessions.create(input.agentId, scope.organizationId, {
          taskKey: input.threadKey ? `platform:${input.threadKey}` : void 0,
          reason: input.reason,
          context: {
            ...scope.projectId ? { projectId: scope.projectId } : {},
            ...scope.workItemId ? { issueId: scope.workItemId } : {}
          }
        });
        return toThread(session, scope.organizationId);
      },
      async list(input) {
        const sessions = await deps.agents.sessions.list(input.agentId, input.organizationId);
        return sessions.map((session) => toThread(session, input.organizationId));
      },
      async send(input) {
        const result = await deps.agents.sessions.sendMessage(input.threadId, input.organizationId, {
          prompt: input.prompt,
          reason: input.reason,
          onEvent: input.onEvent
        });
        const now2 = (/* @__PURE__ */ new Date()).toISOString();
        return {
          id: result.runId,
          scope: normalizeAgentPlatformScope({
            organizationId: input.organizationId,
            threadId: input.threadId
          }),
          threadId: input.threadId,
          agentId: "unknown",
          backendId: null,
          status: "queued",
          startedAt: null,
          finishedAt: null,
          error: null,
          createdAt: now2
        };
      },
      async close(input) {
        await deps.agents.sessions.close(input.threadId, input.organizationId);
      }
    },
    stores: {
      async getState(input) {
        const target = platformScopeToStateScope(input.scope);
        return deps.state.get({ ...target, stateKey: input.stateKey, namespace: input.namespace });
      },
      async setState(input, value) {
        const target = platformScopeToStateScope(input.scope);
        await deps.state.set({ ...target, stateKey: input.stateKey, namespace: input.namespace }, value);
      },
      async deleteState(input) {
        const target = platformScopeToStateScope(input.scope);
        await deps.state.delete({ ...target, stateKey: input.stateKey, namespace: input.namespace });
      }
    },
    backends: {
      async describeAgent(input) {
        const agent = await deps.agents.get(input.agentId, input.organizationId);
        if (!agent)
          throw new Error(`Agent not found: ${input.agentId}`);
        return {
          id: `agent:${agent.id}:adapter`,
          organizationId: input.organizationId,
          kind: "adapter",
          displayName: agent.adapterType,
          status: agent.status === "terminated" ? "disabled" : "configured",
          capabilities: ["agent.run"]
        };
      }
    }
  };
}

// ../../external/sps-core/packages/plugins/sdk/dist/worker-rpc-host.js
import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// ../../external/sps-core/packages/plugins/sdk/dist/protocol.js
var JSONRPC_VERSION = "2.0";
var JSONRPC_ERROR_CODES = {
  /** Invalid JSON was received by the server. */
  PARSE_ERROR: -32700,
  /** The JSON sent is not a valid Request object. */
  INVALID_REQUEST: -32600,
  /** The method does not exist or is not available. */
  METHOD_NOT_FOUND: -32601,
  /** Invalid method parameter(s). */
  INVALID_PARAMS: -32602,
  /** Internal JSON-RPC error. */
  INTERNAL_ERROR: -32603
};
var PLUGIN_RPC_ERROR_CODES = {
  /** The worker process is not running or not reachable. */
  WORKER_UNAVAILABLE: -32e3,
  /** The plugin does not have the required capability for this operation. */
  CAPABILITY_DENIED: -32001,
  /** The worker reported an unhandled error during method execution. */
  WORKER_ERROR: -32002,
  /** The method call timed out waiting for the worker response. */
  TIMEOUT: -32003,
  /** The worker does not implement the requested optional method. */
  METHOD_NOT_IMPLEMENTED: -32004,
  /** The worker→host call attempted to escape the current invocation company scope. */
  INVOCATION_SCOPE_DENIED: -32005,
  /** A catch-all for errors that do not fit other categories. */
  UNKNOWN: -32099
};
var _nextId = 1;
var MAX_SAFE_RPC_ID = Number.MAX_SAFE_INTEGER - 1;
function createRequest(method, params, id) {
  if (_nextId >= MAX_SAFE_RPC_ID) {
    _nextId = 1;
  }
  return {
    jsonrpc: JSONRPC_VERSION,
    id: id ?? _nextId++,
    method,
    params
  };
}
function createSuccessResponse(id, result) {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result
  };
}
function createErrorResponse(id, code, message, data) {
  const response = {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: data !== void 0 ? { code, message, data } : { code, message }
  };
  return response;
}
function createNotification(method, params) {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    params
  };
}
function isJsonRpcRequest(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const obj = value;
  return obj.jsonrpc === JSONRPC_VERSION && typeof obj.method === "string" && "id" in obj && obj.id !== void 0 && obj.id !== null;
}
function isJsonRpcNotification(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const obj = value;
  return obj.jsonrpc === JSONRPC_VERSION && typeof obj.method === "string" && !("id" in obj);
}
function isJsonRpcResponse(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const obj = value;
  return obj.jsonrpc === JSONRPC_VERSION && "id" in obj && ("result" in obj || "error" in obj);
}
function isJsonRpcSuccessResponse(response) {
  return "result" in response && !("error" in response && response.error !== void 0);
}
function isJsonRpcErrorResponse(response) {
  return "error" in response && response.error !== void 0;
}
var MESSAGE_DELIMITER = "\n";
function serializeMessage(message) {
  return JSON.stringify(message) + MESSAGE_DELIMITER;
}
function parseMessage(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new JsonRpcParseError("Empty message");
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new JsonRpcParseError(`Invalid JSON: ${trimmed.slice(0, 200)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new JsonRpcParseError("Message must be a JSON object");
  }
  const obj = parsed;
  if (obj.jsonrpc !== JSONRPC_VERSION) {
    throw new JsonRpcParseError(`Invalid or missing jsonrpc version (expected "${JSONRPC_VERSION}", got ${JSON.stringify(obj.jsonrpc)})`);
  }
  return parsed;
}
var JsonRpcParseError = class extends Error {
  name = "JsonRpcParseError";
  constructor(message) {
    super(message);
  }
};
var JsonRpcCallError = class extends Error {
  name = "JsonRpcCallError";
  /** The JSON-RPC error code. */
  code;
  /** Optional structured error data from the response. */
  data;
  constructor(error) {
    super(error.message);
    this.code = error.code;
    this.data = error.data;
  }
};

// ../../external/sps-core/packages/plugins/sdk/dist/worker-rpc-host.js
var DEFAULT_RPC_TIMEOUT_MS = 3e4;
function realpathOrResolvedPath(filePath) {
  const resolvedPath = path.resolve(filePath);
  try {
    return fs.realpathSync.native(resolvedPath);
  } catch {
    return resolvedPath;
  }
}
function isWorkerEntrypoint(entry, moduleUrl) {
  const thisFile = realpathOrResolvedPath(fileURLToPath(moduleUrl));
  const entryPath = realpathOrResolvedPath(entry);
  return thisFile === entryPath;
}
function runWorker(plugin2, moduleUrl, options) {
  if (options?.stdin != null && options?.stdout != null) {
    return startWorkerRpcHost({
      plugin: plugin2,
      stdin: options.stdin,
      stdout: options.stdout
    });
  }
  const entry = process.argv[1];
  if (typeof entry !== "string")
    return;
  if (isWorkerEntrypoint(entry, moduleUrl)) {
    startWorkerRpcHost({ plugin: plugin2 });
  }
}
function startWorkerRpcHost(options) {
  const { plugin: plugin2 } = options;
  const stdinStream = options.stdin ?? process.stdin;
  const stdoutStream = options.stdout ?? process.stdout;
  const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  let running = true;
  let initialized = false;
  let manifest = null;
  let currentConfig = {};
  let databaseNamespace = null;
  const invocationContextStorage = new AsyncLocalStorage();
  const eventHandlers = [];
  const jobHandlers = /* @__PURE__ */ new Map();
  const launcherRegistrations = /* @__PURE__ */ new Map();
  const dataHandlers = /* @__PURE__ */ new Map();
  const actionHandlers = /* @__PURE__ */ new Map();
  const toolHandlers = /* @__PURE__ */ new Map();
  const dynamicToolNames = /* @__PURE__ */ new Set();
  const sessionEventCallbacks = /* @__PURE__ */ new Map();
  const pendingRequests = /* @__PURE__ */ new Map();
  let nextOutboundId = 1;
  const MAX_OUTBOUND_ID = Number.MAX_SAFE_INTEGER - 1;
  function sendMessage(message) {
    if (!running)
      return;
    const serialized = serializeMessage(message);
    stdoutStream.write(serialized);
  }
  function callHost(method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!running) {
        reject(new Error(`Cannot call "${method}" \u2014 worker RPC host is not running`));
        return;
      }
      if (nextOutboundId >= MAX_OUTBOUND_ID) {
        nextOutboundId = 1;
      }
      const id = nextOutboundId++;
      const timeout = timeoutMs ?? rpcTimeoutMs;
      let settled = false;
      const settle = (fn, value) => {
        if (settled)
          return;
        settled = true;
        clearTimeout(timer);
        pendingRequests.delete(id);
        fn(value);
      };
      const timer = setTimeout(() => {
        settle(reject, new JsonRpcCallError({
          code: PLUGIN_RPC_ERROR_CODES.TIMEOUT,
          message: `Worker\u2192host call "${method}" timed out after ${timeout}ms`
        }));
      }, timeout);
      pendingRequests.set(id, {
        resolve: (response) => {
          if (isJsonRpcSuccessResponse(response)) {
            settle(resolve, response.result);
          } else if (isJsonRpcErrorResponse(response)) {
            settle(reject, new JsonRpcCallError(response.error));
          } else {
            settle(reject, new Error(`Unexpected response format for "${method}"`));
          }
        },
        timer
      });
      try {
        const activeInvocation = invocationContextStorage.getStore();
        const request = {
          ...createRequest(method, params, id),
          ...activeInvocation ? { paperclipInvocationId: activeInvocation.id } : {}
        };
        sendMessage(request);
      } catch (err) {
        settle(reject, err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
  function notifyHost(method, params) {
    try {
      const activeInvocation = invocationContextStorage.getStore();
      sendMessage({
        ...createNotification(method, params),
        ...activeInvocation ? { paperclipInvocationId: activeInvocation.id } : {}
      });
    } catch {
    }
  }
  function buildContext() {
    const context = {
      get manifest() {
        if (!manifest)
          throw new Error("Plugin context accessed before initialization");
        return manifest;
      },
      config: {
        async get() {
          return callHost("config.get", {});
        }
      },
      localFolders: {
        declarations() {
          if (!manifest)
            throw new Error("Plugin context accessed before initialization");
          return manifest.localFolders ?? [];
        },
        async configure(input) {
          return callHost("localFolders.configure", {
            companyId: input.companyId,
            folderKey: input.folderKey,
            path: input.path,
            access: input.access,
            requiredDirectories: input.requiredDirectories,
            requiredFiles: input.requiredFiles
          });
        },
        async status(companyId, folderKey) {
          return callHost("localFolders.status", { companyId, folderKey });
        },
        async list(companyId, folderKey, options2 = {}) {
          return callHost("localFolders.list", {
            companyId,
            folderKey,
            relativePath: options2.relativePath,
            recursive: options2.recursive,
            maxEntries: options2.maxEntries
          });
        },
        async readText(companyId, folderKey, relativePath) {
          return callHost("localFolders.readText", { companyId, folderKey, relativePath });
        },
        async writeTextAtomic(companyId, folderKey, relativePath, contents) {
          return callHost("localFolders.writeTextAtomic", {
            companyId,
            folderKey,
            relativePath,
            contents
          });
        },
        async deleteFile(companyId, folderKey, relativePath) {
          return callHost("localFolders.deleteFile", { companyId, folderKey, relativePath });
        }
      },
      events: {
        on(name, filterOrFn, maybeFn) {
          let registration;
          if (typeof filterOrFn === "function") {
            registration = { name, fn: filterOrFn };
          } else {
            if (!maybeFn)
              throw new Error("Event handler function is required");
            registration = { name, filter: filterOrFn, fn: maybeFn };
          }
          eventHandlers.push(registration);
          void callHost("events.subscribe", { eventPattern: name, filter: registration.filter ?? null }).catch((err) => {
            notifyHost("log", {
              level: "warn",
              message: `Failed to subscribe to event "${name}" on host: ${err instanceof Error ? err.message : String(err)}`
            });
          });
          return () => {
            const idx = eventHandlers.indexOf(registration);
            if (idx !== -1)
              eventHandlers.splice(idx, 1);
          };
        },
        async emit(name, companyId, payload) {
          await callHost("events.emit", { name, companyId, payload });
        }
      },
      memory: {
        async publishLifecycle(input) {
          await callHost("memory.publishLifecycle", input);
        }
      },
      jobs: {
        register(key, fn) {
          jobHandlers.set(key, fn);
        }
      },
      launchers: {
        register(launcher) {
          launcherRegistrations.set(launcher.id, launcher);
        }
      },
      db: {
        get namespace() {
          return databaseNamespace ?? "";
        },
        async query(sql, params) {
          return callHost("db.query", { sql, params });
        },
        async execute(sql, params) {
          return callHost("db.execute", { sql, params });
        }
      },
      http: {
        async fetch(url, init) {
          const serializedInit = {};
          if (init) {
            if (init.method)
              serializedInit.method = init.method;
            if (init.headers) {
              if (init.headers instanceof Headers) {
                const obj = {};
                init.headers.forEach((v, k) => {
                  obj[k] = v;
                });
                serializedInit.headers = obj;
              } else if (Array.isArray(init.headers)) {
                const obj = {};
                for (const [k, v] of init.headers)
                  obj[k] = v;
                serializedInit.headers = obj;
              } else {
                serializedInit.headers = init.headers;
              }
            }
            if (init.body !== void 0 && init.body !== null) {
              serializedInit.body = typeof init.body === "string" ? init.body : String(init.body);
            }
          }
          const result = await callHost("http.fetch", {
            url,
            init: Object.keys(serializedInit).length > 0 ? serializedInit : void 0
          });
          return new Response(result.body, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers
          });
        }
      },
      secrets: {
        async resolve(secretRef) {
          return callHost("secrets.resolve", { secretRef });
        }
      },
      activity: {
        async log(entry) {
          await callHost("activity.log", {
            companyId: entry.companyId,
            message: entry.message,
            entityType: entry.entityType,
            entityId: entry.entityId,
            metadata: entry.metadata
          });
        }
      },
      state: {
        async get(input) {
          return callHost("state.get", {
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            namespace: input.namespace,
            stateKey: input.stateKey
          });
        },
        async set(input, value) {
          await callHost("state.set", {
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            namespace: input.namespace,
            stateKey: input.stateKey,
            value
          });
        },
        async delete(input) {
          await callHost("state.delete", {
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            namespace: input.namespace,
            stateKey: input.stateKey
          });
        }
      },
      entities: {
        async upsert(input) {
          return callHost("entities.upsert", {
            entityType: input.entityType,
            scopeKind: input.scopeKind,
            scopeId: input.scopeId,
            externalId: input.externalId,
            title: input.title,
            status: input.status,
            data: input.data
          });
        },
        async list(query) {
          return callHost("entities.list", {
            entityType: query.entityType,
            scopeKind: query.scopeKind,
            scopeId: query.scopeId,
            externalId: query.externalId,
            limit: query.limit,
            offset: query.offset
          });
        }
      },
      projects: {
        async list(input) {
          return callHost("projects.list", {
            companyId: input.companyId,
            limit: input.limit,
            offset: input.offset
          });
        },
        async get(projectId, companyId) {
          return callHost("projects.get", { projectId, companyId });
        },
        async listWorkspaces(projectId, companyId) {
          return callHost("projects.listWorkspaces", { projectId, companyId });
        },
        async createWorkspace(projectId, input, companyId) {
          return callHost("projects.createWorkspace", { projectId, input, companyId });
        },
        async updateWorkspace(projectId, workspaceId, input, companyId) {
          return callHost("projects.updateWorkspace", { projectId, workspaceId, input, companyId });
        },
        async removeWorkspace(projectId, workspaceId, companyId) {
          return callHost("projects.removeWorkspace", { projectId, workspaceId, companyId });
        },
        async getPrimaryWorkspace(projectId, companyId) {
          return callHost("projects.getPrimaryWorkspace", { projectId, companyId });
        },
        async getWorkspaceForIssue(issueId, companyId) {
          return callHost("projects.getWorkspaceForIssue", { issueId, companyId });
        },
        managed: {
          async get(projectKey, companyId) {
            return callHost("projects.managed.get", { projectKey, companyId });
          },
          async reconcile(projectKey, companyId) {
            return callHost("projects.managed.reconcile", { projectKey, companyId });
          },
          async reset(projectKey, companyId) {
            return callHost("projects.managed.reset", { projectKey, companyId });
          }
        }
      },
      executionWorkspaces: {
        async get(workspaceId, companyId) {
          return callHost("executionWorkspaces.get", { workspaceId, companyId });
        }
      },
      routines: {
        managed: {
          async get(routineKey, companyId) {
            return callHost("routines.managed.get", { routineKey, companyId });
          },
          async reconcile(routineKey, companyId, overrides) {
            return callHost("routines.managed.reconcile", { routineKey, companyId, ...overrides });
          },
          async reset(routineKey, companyId, overrides) {
            return callHost("routines.managed.reset", { routineKey, companyId, ...overrides });
          },
          async update(routineKey, companyId, patch) {
            return callHost("routines.managed.update", { routineKey, companyId, ...patch });
          },
          async run(routineKey, companyId, overrides) {
            return callHost("routines.managed.run", { routineKey, companyId, ...overrides });
          }
        }
      },
      skills: {
        managed: {
          async get(skillKey, companyId) {
            return callHost("skills.managed.get", { skillKey, companyId });
          },
          async reconcile(skillKey, companyId) {
            return callHost("skills.managed.reconcile", { skillKey, companyId });
          },
          async reset(skillKey, companyId) {
            return callHost("skills.managed.reset", { skillKey, companyId });
          }
        }
      },
      companies: {
        async list(input) {
          return callHost("companies.list", {
            limit: input?.limit,
            offset: input?.offset
          });
        },
        async get(companyId) {
          return callHost("companies.get", { companyId });
        }
      },
      issues: {
        async list(input) {
          return callHost("issues.list", {
            companyId: input.companyId,
            projectId: input.projectId,
            assigneeAgentId: input.assigneeAgentId,
            originKind: input.originKind,
            originKindPrefix: input.originKindPrefix,
            originId: input.originId,
            status: input.status,
            includePluginOperations: input.includePluginOperations,
            limit: input.limit,
            offset: input.offset
          });
        },
        async get(issueId, companyId) {
          return callHost("issues.get", { issueId, companyId });
        },
        async create(input) {
          return callHost("issues.create", {
            companyId: input.companyId,
            projectId: input.projectId,
            goalId: input.goalId,
            parentId: input.parentId,
            inheritExecutionWorkspaceFromIssueId: input.inheritExecutionWorkspaceFromIssueId,
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            assigneeAgentId: input.assigneeAgentId,
            assigneeUserId: input.assigneeUserId,
            requestDepth: input.requestDepth,
            billingCode: input.billingCode,
            assigneeAdapterOverrides: input.assigneeAdapterOverrides,
            surfaceVisibility: input.surfaceVisibility,
            originKind: input.originKind,
            originId: input.originId,
            originRunId: input.originRunId,
            blockedByIssueIds: input.blockedByIssueIds,
            labelIds: input.labelIds,
            executionWorkspaceId: input.executionWorkspaceId,
            executionWorkspacePreference: input.executionWorkspacePreference,
            executionWorkspaceSettings: input.executionWorkspaceSettings,
            projectWorkspaceId: input.projectWorkspaceId,
            executionPolicy: input.executionPolicy,
            actorAgentId: input.actor?.actorAgentId,
            actorUserId: input.actor?.actorUserId,
            actorRunId: input.actor?.actorRunId
          });
        },
        async update(issueId, patch, companyId, actor) {
          return callHost("issues.update", {
            issueId,
            patch: {
              ...patch,
              actorAgentId: actor?.actorAgentId,
              actorUserId: actor?.actorUserId,
              actorRunId: actor?.actorRunId
            },
            companyId
          });
        },
        async assertCheckoutOwner(input) {
          return callHost("issues.assertCheckoutOwner", input);
        },
        async getSubtree(issueId, companyId, options2) {
          return callHost("issues.getSubtree", {
            issueId,
            companyId,
            includeRoot: options2?.includeRoot,
            includeRelations: options2?.includeRelations,
            includeDocuments: options2?.includeDocuments,
            includeActiveRuns: options2?.includeActiveRuns,
            includeAssignees: options2?.includeAssignees
          });
        },
        async requestWakeup(issueId, companyId, options2) {
          return callHost("issues.requestWakeup", {
            issueId,
            companyId,
            reason: options2?.reason,
            contextSource: options2?.contextSource,
            idempotencyKey: options2?.idempotencyKey,
            actorAgentId: options2?.actorAgentId,
            actorUserId: options2?.actorUserId,
            actorRunId: options2?.actorRunId
          });
        },
        async requestWakeups(issueIds, companyId, options2) {
          return callHost("issues.requestWakeups", {
            issueIds,
            companyId,
            reason: options2?.reason,
            contextSource: options2?.contextSource,
            idempotencyKeyPrefix: options2?.idempotencyKeyPrefix,
            actorAgentId: options2?.actorAgentId,
            actorUserId: options2?.actorUserId,
            actorRunId: options2?.actorRunId
          });
        },
        async listComments(issueId, companyId) {
          return callHost("issues.listComments", { issueId, companyId });
        },
        async createComment(issueId, body, companyId, options2) {
          return callHost("issues.createComment", { issueId, body, companyId, authorAgentId: options2?.authorAgentId });
        },
        async submitReport(input) {
          return callHost("issues.submitReport", {
            issueId: input.issueId,
            companyId: input.companyId,
            kind: input.kind,
            body: input.body,
            actorAgentId: input.actorAgentId,
            actorRunId: input.actorRunId
          });
        },
        async createInteraction(issueId, interaction, companyId, options2) {
          return callHost("issues.createInteraction", {
            issueId,
            companyId,
            interaction,
            authorAgentId: options2?.authorAgentId
          });
        },
        async suggestTasks(issueId, interaction, companyId, options2) {
          return callHost("issues.createInteraction", {
            issueId,
            companyId,
            interaction: {
              ...interaction,
              kind: "suggest_tasks"
            },
            authorAgentId: options2?.authorAgentId
          });
        },
        async askUserQuestions(issueId, interaction, companyId, options2) {
          return callHost("issues.createInteraction", {
            issueId,
            companyId,
            interaction: {
              ...interaction,
              kind: "ask_user_questions"
            },
            authorAgentId: options2?.authorAgentId
          });
        },
        async requestConfirmation(issueId, interaction, companyId, options2) {
          return callHost("issues.createInteraction", {
            issueId,
            companyId,
            interaction: {
              ...interaction,
              kind: "request_confirmation"
            },
            authorAgentId: options2?.authorAgentId
          });
        },
        async requestCheckboxConfirmation(issueId, interaction, companyId, options2) {
          return callHost("issues.createInteraction", {
            issueId,
            companyId,
            interaction: {
              ...interaction,
              kind: "request_checkbox_confirmation"
            },
            authorAgentId: options2?.authorAgentId
          });
        },
        documents: {
          async list(issueId, companyId) {
            return callHost("issues.documents.list", { issueId, companyId });
          },
          async get(issueId, key, companyId) {
            return callHost("issues.documents.get", { issueId, key, companyId });
          },
          async upsert(input) {
            return callHost("issues.documents.upsert", {
              issueId: input.issueId,
              key: input.key,
              body: input.body,
              companyId: input.companyId,
              title: input.title,
              format: input.format,
              changeSummary: input.changeSummary
            });
          },
          async delete(issueId, key, companyId) {
            return callHost("issues.documents.delete", { issueId, key, companyId });
          }
        },
        relations: {
          async get(issueId, companyId) {
            return callHost("issues.relations.get", { issueId, companyId });
          },
          async setBlockedBy(issueId, blockedByIssueIds, companyId, actor) {
            return callHost("issues.relations.setBlockedBy", {
              issueId,
              companyId,
              blockedByIssueIds,
              actorAgentId: actor?.actorAgentId,
              actorUserId: actor?.actorUserId,
              actorRunId: actor?.actorRunId
            });
          },
          async addBlockers(issueId, blockerIssueIds, companyId, actor) {
            return callHost("issues.relations.addBlockers", {
              issueId,
              companyId,
              blockerIssueIds,
              actorAgentId: actor?.actorAgentId,
              actorUserId: actor?.actorUserId,
              actorRunId: actor?.actorRunId
            });
          },
          async removeBlockers(issueId, blockerIssueIds, companyId, actor) {
            return callHost("issues.relations.removeBlockers", {
              issueId,
              companyId,
              blockerIssueIds,
              actorAgentId: actor?.actorAgentId,
              actorUserId: actor?.actorUserId,
              actorRunId: actor?.actorRunId
            });
          }
        },
        summaries: {
          async getOrchestration(input) {
            return callHost("issues.summaries.getOrchestration", input);
          }
        }
      },
      agents: {
        async list(input) {
          return callHost("agents.list", {
            companyId: input.companyId,
            status: input.status,
            limit: input.limit,
            offset: input.offset
          });
        },
        async get(agentId, companyId) {
          return callHost("agents.get", { agentId, companyId });
        },
        async pause(agentId, companyId) {
          return callHost("agents.pause", { agentId, companyId });
        },
        async resume(agentId, companyId) {
          return callHost("agents.resume", { agentId, companyId });
        },
        async invoke(agentId, companyId, opts) {
          return callHost("agents.invoke", { agentId, companyId, prompt: opts.prompt, reason: opts.reason });
        },
        managed: {
          async get(agentKey, companyId) {
            return callHost("agents.managed.get", { agentKey, companyId });
          },
          async reconcile(agentKey, companyId) {
            return callHost("agents.managed.reconcile", { agentKey, companyId });
          },
          async reset(agentKey, companyId) {
            return callHost("agents.managed.reset", { agentKey, companyId });
          }
        },
        sessions: {
          async create(agentId, companyId, opts) {
            return callHost("agents.sessions.create", {
              agentId,
              companyId,
              taskKey: opts?.taskKey,
              reason: opts?.reason,
              context: opts?.context
            });
          },
          async list(agentId, companyId) {
            return callHost("agents.sessions.list", { agentId, companyId });
          },
          async sendMessage(sessionId, companyId, opts) {
            if (opts.onEvent) {
              sessionEventCallbacks.set(sessionId, opts.onEvent);
            }
            try {
              return await callHost("agents.sessions.sendMessage", {
                sessionId,
                companyId,
                prompt: opts.prompt,
                reason: opts.reason
              });
            } catch (err) {
              sessionEventCallbacks.delete(sessionId);
              throw err;
            }
          },
          async close(sessionId, companyId) {
            sessionEventCallbacks.delete(sessionId);
            await callHost("agents.sessions.close", { sessionId, companyId });
          }
        }
      },
      goals: {
        async list(input) {
          return callHost("goals.list", {
            companyId: input.companyId,
            level: input.level,
            status: input.status,
            limit: input.limit,
            offset: input.offset
          });
        },
        async get(goalId, companyId) {
          return callHost("goals.get", { goalId, companyId });
        },
        async create(input) {
          return callHost("goals.create", {
            companyId: input.companyId,
            title: input.title,
            description: input.description,
            level: input.level,
            status: input.status,
            parentId: input.parentId,
            ownerAgentId: input.ownerAgentId
          });
        },
        async update(goalId, patch, companyId) {
          return callHost("goals.update", {
            goalId,
            patch,
            companyId
          });
        }
      },
      access: {
        members: {
          async list(input) {
            return callHost("access.members.list", {
              companyId: input.companyId,
              includeArchived: input.includeArchived
            });
          },
          async get(memberId, companyId) {
            return callHost("access.members.get", { memberId, companyId });
          },
          async update(memberId, patch, companyId) {
            return callHost("access.members.update", { memberId, patch, companyId });
          }
        },
        invites: {
          async list(input) {
            return callHost("access.invites.list", {
              companyId: input.companyId,
              state: input.state,
              limit: input.limit,
              offset: input.offset
            });
          },
          async create(input) {
            return callHost("access.invites.create", {
              companyId: input.companyId,
              allowedJoinTypes: input.allowedJoinTypes,
              humanRole: input.humanRole,
              defaultsPayload: input.defaultsPayload,
              agentMessage: input.agentMessage
            });
          },
          async revoke(inviteId, companyId) {
            return callHost("access.invites.revoke", { inviteId, companyId });
          }
        }
      },
      authorization: {
        grants: {
          async list(input) {
            return callHost("authorization.grants.list", input);
          },
          async set(input) {
            return callHost("authorization.grants.set", input);
          }
        },
        policies: {
          async summary(companyId) {
            return callHost("authorization.policies.summary", { companyId });
          },
          async get(input) {
            return callHost("authorization.policies.get", input);
          },
          async update(input) {
            return callHost("authorization.policies.update", input);
          },
          async previewAssignment(input) {
            return callHost("authorization.policies.previewAssignment", input);
          },
          async explainAssignment(input) {
            return callHost("authorization.policies.explainAssignment", input);
          }
        },
        audit: {
          async search(input) {
            return callHost("authorization.audit.search", input);
          }
        }
      },
      data: {
        register(key, handler) {
          dataHandlers.set(key, handler);
        }
      },
      actions: {
        register(key, handler) {
          actionHandlers.set(key, handler);
        }
      },
      streams: /* @__PURE__ */ (() => {
        const channelCompanyMap = /* @__PURE__ */ new Map();
        return {
          open(channel, companyId) {
            channelCompanyMap.set(channel, companyId);
            notifyHost("streams.open", { channel, companyId });
          },
          emit(channel, event) {
            const companyId = channelCompanyMap.get(channel) ?? "";
            notifyHost("streams.emit", { channel, companyId, event });
          },
          close(channel) {
            const companyId = channelCompanyMap.get(channel) ?? "";
            channelCompanyMap.delete(channel);
            notifyHost("streams.close", { channel, companyId });
          }
        };
      })(),
      tools: {
        register(name, declaration, fn) {
          toolHandlers.set(name, { declaration, fn });
        },
        async replaceDynamic(tools) {
          const seenNames = /* @__PURE__ */ new Set();
          for (const tool of tools) {
            if (!tool.name || seenNames.has(tool.name)) {
              throw new Error("Dynamic tool names must be non-empty and unique");
            }
            seenNames.add(tool.name);
          }
          const previousHandlers = new Map(toolHandlers);
          const previousNames = new Set(dynamicToolNames);
          for (const name of dynamicToolNames)
            toolHandlers.delete(name);
          dynamicToolNames.clear();
          for (const tool of tools) {
            toolHandlers.set(tool.name, { declaration: tool.declaration, fn: tool.fn });
            dynamicToolNames.add(tool.name);
          }
          try {
            return await callHost("agentTools.replaceDynamic", {
              tools: tools.map((tool) => ({ name: tool.name, ...tool.declaration }))
            });
          } catch (error) {
            toolHandlers.clear();
            for (const [name, handler] of previousHandlers)
              toolHandlers.set(name, handler);
            dynamicToolNames.clear();
            for (const name of previousNames)
              dynamicToolNames.add(name);
            throw error;
          }
        }
      },
      metrics: {
        async write(name, value, tags) {
          await callHost("metrics.write", { name, value, tags });
        }
      },
      telemetry: {
        async track(eventName, dimensions) {
          await callHost("telemetry.track", { eventName, dimensions });
        }
      },
      logger: {
        info(message, meta) {
          notifyHost("log", { level: "info", message, meta });
        },
        warn(message, meta) {
          notifyHost("log", { level: "warn", message, meta });
        },
        error(message, meta) {
          notifyHost("log", { level: "error", message, meta });
        },
        debug(message, meta) {
          notifyHost("log", { level: "debug", message, meta });
        }
      }
    };
    Object.defineProperty(context, "platform", {
      configurable: false,
      enumerable: true,
      value: createPluginPlatformClient(context),
      writable: false
    });
    return context;
  }
  const ctx = buildContext();
  async function handleHostRequest(request) {
    const { id, method, params } = request;
    try {
      const invoke = () => dispatchMethod(method, params);
      const result = request.paperclipInvocation ? await invocationContextStorage.run(request.paperclipInvocation, invoke) : await invoke();
      sendMessage(createSuccessResponse(id, result ?? null));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = typeof err?.code === "number" ? err.code : PLUGIN_RPC_ERROR_CODES.WORKER_ERROR;
      sendMessage(createErrorResponse(id, errorCode, errorMessage));
    }
  }
  async function dispatchMethod(method, params) {
    switch (method) {
      case "initialize":
        return handleInitialize(params);
      case "health":
        return handleHealth();
      case "shutdown":
        return handleShutdown();
      case "validateConfig":
        return handleValidateConfig(params);
      case "configChanged":
        return handleConfigChanged(params);
      case "onEvent":
        return handleOnEvent(params);
      case "runJob":
        return handleRunJob(params);
      case "handleWebhook":
        return handleWebhook(params);
      case "handleApiRequest":
        return handleApiRequest(params);
      case "getData":
        return handleGetData(params);
      case "performAction":
        return handlePerformAction(params);
      case "executeTool":
        return handleExecuteTool(params);
      case "detectExternalObjects":
        return handleDetectExternalObjects(params);
      case "resolveExternalObject":
        return handleResolveExternalObject(params);
      case "refreshExternalObjects":
        return handleRefreshExternalObjects(params);
      case "environmentValidateConfig":
        return handleEnvironmentValidateConfig(params);
      case "environmentProbe":
        return handleEnvironmentProbe(params);
      case "environmentAcquireLease":
        return handleEnvironmentAcquireLease(params);
      case "environmentResumeLease":
        return handleEnvironmentResumeLease(params);
      case "environmentReleaseLease":
        return handleEnvironmentReleaseLease(params);
      case "environmentDestroyLease":
        return handleEnvironmentDestroyLease(params);
      case "environmentRealizeWorkspace":
        return handleEnvironmentRealizeWorkspace(params);
      case "environmentExecute":
        return handleEnvironmentExecute(params);
      case "environmentStartInteractiveSetup":
        return handleEnvironmentStartInteractiveSetup(params);
      case "environmentGetInteractiveSetup":
        return handleEnvironmentGetInteractiveSetup(params);
      case "environmentCaptureTemplate":
        return handleEnvironmentCaptureTemplate(params);
      case "environmentCancelInteractiveSetup":
        return handleEnvironmentCancelInteractiveSetup(params);
      case "environmentDeleteTemplate":
        return handleEnvironmentDeleteTemplate(params);
      default:
        throw Object.assign(new Error(`Unknown method: ${method}`), { code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND });
    }
  }
  async function handleInitialize(params) {
    if (initialized) {
      throw new Error("Worker already initialized");
    }
    manifest = params.manifest;
    currentConfig = params.config;
    databaseNamespace = params.databaseNamespace ?? null;
    await plugin2.definition.setup(ctx);
    initialized = true;
    const supportedMethods = [];
    if (plugin2.definition.onValidateConfig)
      supportedMethods.push("validateConfig");
    if (plugin2.definition.onConfigChanged)
      supportedMethods.push("configChanged");
    if (plugin2.definition.onHealth)
      supportedMethods.push("health");
    if (plugin2.definition.onShutdown)
      supportedMethods.push("shutdown");
    if (plugin2.definition.onApiRequest)
      supportedMethods.push("handleApiRequest");
    if (plugin2.definition.onDetectExternalObjects)
      supportedMethods.push("detectExternalObjects");
    if (plugin2.definition.onResolveExternalObject)
      supportedMethods.push("resolveExternalObject");
    if (plugin2.definition.onRefreshExternalObjects)
      supportedMethods.push("refreshExternalObjects");
    if (plugin2.definition.onEnvironmentValidateConfig)
      supportedMethods.push("environmentValidateConfig");
    if (plugin2.definition.onEnvironmentProbe)
      supportedMethods.push("environmentProbe");
    if (plugin2.definition.onEnvironmentAcquireLease)
      supportedMethods.push("environmentAcquireLease");
    if (plugin2.definition.onEnvironmentResumeLease)
      supportedMethods.push("environmentResumeLease");
    if (plugin2.definition.onEnvironmentReleaseLease)
      supportedMethods.push("environmentReleaseLease");
    if (plugin2.definition.onEnvironmentDestroyLease)
      supportedMethods.push("environmentDestroyLease");
    if (plugin2.definition.onEnvironmentRealizeWorkspace)
      supportedMethods.push("environmentRealizeWorkspace");
    if (plugin2.definition.onEnvironmentExecute)
      supportedMethods.push("environmentExecute");
    if (plugin2.definition.onEnvironmentStartInteractiveSetup)
      supportedMethods.push("environmentStartInteractiveSetup");
    if (plugin2.definition.onEnvironmentGetInteractiveSetup)
      supportedMethods.push("environmentGetInteractiveSetup");
    if (plugin2.definition.onEnvironmentCaptureTemplate)
      supportedMethods.push("environmentCaptureTemplate");
    if (plugin2.definition.onEnvironmentCancelInteractiveSetup)
      supportedMethods.push("environmentCancelInteractiveSetup");
    if (plugin2.definition.onEnvironmentDeleteTemplate)
      supportedMethods.push("environmentDeleteTemplate");
    return { ok: true, supportedMethods };
  }
  async function handleHealth() {
    if (plugin2.definition.onHealth) {
      return plugin2.definition.onHealth();
    }
    return { status: "ok" };
  }
  async function handleShutdown() {
    if (plugin2.definition.onShutdown) {
      await plugin2.definition.onShutdown();
    }
    setImmediate(() => {
      cleanup();
      if (!options.stdin && !options.stdout) {
        process.exit(0);
      }
    });
  }
  async function handleValidateConfig(params) {
    if (!plugin2.definition.onValidateConfig) {
      throw Object.assign(new Error("validateConfig is not implemented by this plugin"), { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED });
    }
    return plugin2.definition.onValidateConfig(params.config);
  }
  async function handleConfigChanged(params) {
    currentConfig = params.config;
    if (plugin2.definition.onConfigChanged) {
      await plugin2.definition.onConfigChanged(params.config);
    }
  }
  async function handleOnEvent(params) {
    const event = params.event;
    const handlerErrors = [];
    for (const registration of eventHandlers) {
      const exactMatch = registration.name === event.eventType;
      const wildcardPluginAll = registration.name === "plugin.*" && event.eventType.startsWith("plugin.");
      const wildcardPluginOne = registration.name.endsWith(".*") && event.eventType.startsWith(registration.name.slice(0, -1));
      if (!exactMatch && !wildcardPluginAll && !wildcardPluginOne)
        continue;
      if (registration.filter && !allowsEvent(registration.filter, event))
        continue;
      try {
        await registration.fn(event);
      } catch (err) {
        handlerErrors.push(err);
        notifyHost("log", {
          level: "error",
          message: `Event handler for "${registration.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          meta: { eventType: event.eventType, stack: err instanceof Error ? err.stack : void 0 }
        });
      }
    }
    if (handlerErrors.length > 0) {
      throw new AggregateError(handlerErrors, `${handlerErrors.length} event handler(s) failed for "${event.eventType}"`);
    }
  }
  async function handleRunJob(params) {
    const handler = jobHandlers.get(params.job.jobKey);
    if (!handler) {
      throw new Error(`No handler registered for job "${params.job.jobKey}"`);
    }
    await handler(params.job);
  }
  async function handleWebhook(params) {
    if (!plugin2.definition.onWebhook) {
      throw Object.assign(new Error("handleWebhook is not implemented by this plugin"), { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED });
    }
    await plugin2.definition.onWebhook(params);
  }
  async function handleApiRequest(params) {
    if (!plugin2.definition.onApiRequest) {
      throw Object.assign(new Error("handleApiRequest is not implemented by this plugin"), { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED });
    }
    return plugin2.definition.onApiRequest(params);
  }
  async function handleGetData(params) {
    const handler = dataHandlers.get(params.key);
    if (!handler) {
      throw new Error(`No data handler registered for key "${params.key}"`);
    }
    return handler({
      ...params.params,
      ...params.companyId === void 0 ? {} : { companyId: params.companyId },
      ...params.renderEnvironment === void 0 ? {} : { renderEnvironment: params.renderEnvironment }
    });
  }
  function stringOrNull(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }
  function actorTypeOrSystem(value) {
    return value === "user" || value === "agent" || value === "system" ? value : "system";
  }
  function permissionKeys(value) {
    if (!Array.isArray(value))
      return void 0;
    const permissions = value.filter((entry) => typeof entry === "string" && PERMISSION_KEYS.includes(entry));
    return permissions.length ? permissions : void 0;
  }
  function actionContextFromParams(params) {
    const rawActor = params.actorContext && typeof params.actorContext === "object" ? params.actorContext : null;
    const permissions = permissionKeys(rawActor?.permissions);
    const actor = Object.freeze({
      type: actorTypeOrSystem(rawActor?.type),
      userId: stringOrNull(rawActor?.userId),
      agentId: stringOrNull(rawActor?.agentId),
      runId: stringOrNull(rawActor?.runId),
      companyId: stringOrNull(rawActor?.companyId),
      ...permissions ? { permissions } : {}
    });
    return Object.freeze({
      actor,
      companyId: actor.companyId
    });
  }
  async function handlePerformAction(params) {
    const handler = actionHandlers.get(params.key);
    if (!handler) {
      throw new Error(`No action handler registered for key "${params.key}"`);
    }
    return handler({
      ...params.params,
      ...params.companyId === void 0 ? {} : { companyId: params.companyId },
      ...params.renderEnvironment === void 0 ? {} : { renderEnvironment: params.renderEnvironment }
    }, actionContextFromParams(params));
  }
  async function handleExecuteTool(params) {
    const entry = toolHandlers.get(params.toolName);
    if (!entry) {
      throw new Error(`No tool handler registered for "${params.toolName}"`);
    }
    return entry.fn(params.parameters, params.runContext);
  }
  async function handleDetectExternalObjects(params) {
    if (!plugin2.definition.onDetectExternalObjects) {
      throw methodNotImplemented("detectExternalObjects");
    }
    return plugin2.definition.onDetectExternalObjects(params);
  }
  async function handleResolveExternalObject(params) {
    if (!plugin2.definition.onResolveExternalObject) {
      throw methodNotImplemented("resolveExternalObject");
    }
    return plugin2.definition.onResolveExternalObject(params);
  }
  async function handleRefreshExternalObjects(params) {
    if (!plugin2.definition.onRefreshExternalObjects) {
      throw methodNotImplemented("refreshExternalObjects");
    }
    return plugin2.definition.onRefreshExternalObjects(params);
  }
  function methodNotImplemented(method) {
    return Object.assign(new Error(`${method} is not implemented by this plugin`), { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED });
  }
  async function handleEnvironmentValidateConfig(params) {
    if (!plugin2.definition.onEnvironmentValidateConfig) {
      throw methodNotImplemented("environmentValidateConfig");
    }
    return plugin2.definition.onEnvironmentValidateConfig(params);
  }
  async function handleEnvironmentProbe(params) {
    if (!plugin2.definition.onEnvironmentProbe) {
      throw methodNotImplemented("environmentProbe");
    }
    return plugin2.definition.onEnvironmentProbe(params);
  }
  async function handleEnvironmentAcquireLease(params) {
    if (!plugin2.definition.onEnvironmentAcquireLease) {
      throw methodNotImplemented("environmentAcquireLease");
    }
    return plugin2.definition.onEnvironmentAcquireLease(params);
  }
  async function handleEnvironmentResumeLease(params) {
    if (!plugin2.definition.onEnvironmentResumeLease) {
      throw methodNotImplemented("environmentResumeLease");
    }
    return plugin2.definition.onEnvironmentResumeLease(params);
  }
  async function handleEnvironmentReleaseLease(params) {
    if (!plugin2.definition.onEnvironmentReleaseLease) {
      throw methodNotImplemented("environmentReleaseLease");
    }
    return plugin2.definition.onEnvironmentReleaseLease(params);
  }
  async function handleEnvironmentDestroyLease(params) {
    if (!plugin2.definition.onEnvironmentDestroyLease) {
      throw methodNotImplemented("environmentDestroyLease");
    }
    return plugin2.definition.onEnvironmentDestroyLease(params);
  }
  async function handleEnvironmentRealizeWorkspace(params) {
    if (!plugin2.definition.onEnvironmentRealizeWorkspace) {
      throw methodNotImplemented("environmentRealizeWorkspace");
    }
    return plugin2.definition.onEnvironmentRealizeWorkspace(params);
  }
  async function handleEnvironmentExecute(params) {
    if (!plugin2.definition.onEnvironmentExecute) {
      throw methodNotImplemented("environmentExecute");
    }
    return plugin2.definition.onEnvironmentExecute(params);
  }
  async function handleEnvironmentStartInteractiveSetup(params) {
    if (!plugin2.definition.onEnvironmentStartInteractiveSetup) {
      throw methodNotImplemented("environmentStartInteractiveSetup");
    }
    return plugin2.definition.onEnvironmentStartInteractiveSetup(params);
  }
  async function handleEnvironmentGetInteractiveSetup(params) {
    if (!plugin2.definition.onEnvironmentGetInteractiveSetup) {
      throw methodNotImplemented("environmentGetInteractiveSetup");
    }
    return plugin2.definition.onEnvironmentGetInteractiveSetup(params);
  }
  async function handleEnvironmentCaptureTemplate(params) {
    if (!plugin2.definition.onEnvironmentCaptureTemplate) {
      throw methodNotImplemented("environmentCaptureTemplate");
    }
    return plugin2.definition.onEnvironmentCaptureTemplate(params);
  }
  async function handleEnvironmentCancelInteractiveSetup(params) {
    if (!plugin2.definition.onEnvironmentCancelInteractiveSetup) {
      throw methodNotImplemented("environmentCancelInteractiveSetup");
    }
    return plugin2.definition.onEnvironmentCancelInteractiveSetup(params);
  }
  async function handleEnvironmentDeleteTemplate(params) {
    if (!plugin2.definition.onEnvironmentDeleteTemplate) {
      throw methodNotImplemented("environmentDeleteTemplate");
    }
    return plugin2.definition.onEnvironmentDeleteTemplate(params);
  }
  function allowsEvent(filter, event) {
    const payload = event.payload;
    if (filter.companyId !== void 0) {
      const companyId = event.companyId ?? String(payload?.companyId ?? "");
      if (companyId !== filter.companyId)
        return false;
    }
    if (filter.projectId !== void 0) {
      const projectId = event.entityType === "project" ? event.entityId : String(payload?.projectId ?? "");
      if (projectId !== filter.projectId)
        return false;
    }
    if (filter.agentId !== void 0) {
      const agentId = event.entityType === "agent" ? event.entityId : String(payload?.agentId ?? "");
      if (agentId !== filter.agentId)
        return false;
    }
    return true;
  }
  function handleHostResponse(response) {
    const id = response.id;
    if (id === null || id === void 0)
      return;
    const pending = pendingRequests.get(id);
    if (!pending)
      return;
    clearTimeout(pending.timer);
    pendingRequests.delete(id);
    pending.resolve(response);
  }
  function handleLine(line) {
    if (!line.trim())
      return;
    let message;
    try {
      message = parseMessage(line);
    } catch (err) {
      if (err instanceof JsonRpcParseError) {
        sendMessage(createErrorResponse(null, JSONRPC_ERROR_CODES.PARSE_ERROR, `Parse error: ${err.message}`));
      }
      return;
    }
    if (isJsonRpcResponse(message)) {
      handleHostResponse(message);
    } else if (isJsonRpcRequest(message)) {
      handleHostRequest(message).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorCode = err?.code ?? PLUGIN_RPC_ERROR_CODES.WORKER_ERROR;
        try {
          sendMessage(createErrorResponse(message.id, typeof errorCode === "number" ? errorCode : PLUGIN_RPC_ERROR_CODES.WORKER_ERROR, errorMessage));
        } catch {
        }
      });
    } else if (isJsonRpcNotification(message)) {
      const notif = message;
      const runNotification = (fn) => {
        if (notif.paperclipInvocation) {
          return invocationContextStorage.run(notif.paperclipInvocation, fn);
        }
        return fn();
      };
      if (notif.method === "agents.sessions.event" && notif.params) {
        const event = notif.params;
        const cb = sessionEventCallbacks.get(event.sessionId);
        if (cb)
          cb(event);
      } else if (notif.method === "onEvent" && notif.params) {
        Promise.resolve(runNotification(() => handleOnEvent(notif.params))).catch((err) => {
          notifyHost("log", {
            level: "error",
            message: `Failed to handle event notification: ${err instanceof Error ? err.message : String(err)}`
          });
        });
      }
    }
  }
  function cleanup() {
    running = false;
    if (readline) {
      readline.close();
      readline = null;
    }
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(createErrorResponse(id, PLUGIN_RPC_ERROR_CODES.WORKER_UNAVAILABLE, "Worker RPC host is shutting down"));
    }
    pendingRequests.clear();
    sessionEventCallbacks.clear();
  }
  let readline = createInterface({
    input: stdinStream,
    crlfDelay: Infinity
  });
  readline.on("line", handleLine);
  readline.on("close", () => {
    if (running) {
      cleanup();
      if (!options.stdin && !options.stdout) {
        process.exit(0);
      }
    }
  });
  if (!options.stdin && !options.stdout) {
    process.on("uncaughtException", (err) => {
      notifyHost("log", {
        level: "error",
        message: `Uncaught exception: ${err.message}`,
        meta: { stack: err.stack }
      });
      setTimeout(() => process.exit(1), 100);
    });
    process.on("unhandledRejection", (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : void 0;
      notifyHost("log", {
        level: "error",
        message: `Unhandled rejection: ${message}`,
        meta: { stack }
      });
    });
  }
  return {
    get running() {
      return running;
    },
    stop() {
      cleanup();
    }
  };
}

// src/manifest.js
var manifest_default = {
  id: "local.room-chat",
  apiVersion: 1,
  version: "0.3.61",
  displayName: "SPS Rooms",
  description: "Long-lived project Agent Rooms backed by SPS Agent Sessions.",
  author: "local",
  categories: ["automation"],
  capabilities: [
    "ui.page.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.read",
    "issue.comments.create",
    "issue.documents.read",
    "issue.documents.write",
    "agents.read",
    "companies.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "projects.read",
    "project.workspaces.read",
    "project.workspaces.write",
    "events.subscribe",
    "memory.lifecycle.publish",
    "jobs.schedule",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register"
  ],
  agentPlatform: {
    contractVersion: "1.0",
    kind: "workplane",
    profileKey: "sps-lead-worker"
  },
  jobs: [
    {
      jobKey: "workplane-reconcile",
      displayName: "Workplane reconciliation",
      description: "Recovers missed Task owner reports and preserves visible Worker quota blocks without automatic retries.",
      schedule: "* * * * *"
    }
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui-v0.3.61"
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "agent-rooms",
        routePath: "agent-rooms",
        displayName: "Agent Rooms",
        exportName: "AgentRoomsPage",
        order: 9
      },
      {
        type: "page",
        id: "project-tasks",
        routePath: "tasks",
        displayName: "Tasks",
        exportName: "ProjectTasksPage",
        order: 10
      },
      {
        type: "projectSidebarItem",
        id: "project-workplane-link",
        entityTypes: ["project"],
        displayName: "Rooms",
        exportName: "ProjectWorkplaneLink",
        order: 10
      },
      {
        type: "projectSidebarItem",
        id: "project-tasks-link",
        entityTypes: ["project"],
        displayName: "Tasks",
        exportName: "ProjectTasksProjectLink",
        order: 11
      },
      {
        type: "detailTab",
        id: "project-workplane",
        entityTypes: ["project"],
        displayName: "Workplane",
        exportName: "ProjectWorkplaneTab",
        order: 89
      },
      {
        type: "agentConfiguration",
        id: "codex-account-configuration",
        entityTypes: ["agent"],
        displayName: "Codex CLI Account",
        exportName: "CodexAgentAccountConfiguration",
        order: 20
      },
      {
        type: "companySettingsPage",
        id: "organization-settings",
        displayName: "Organization",
        exportName: "OrganizationSettingsPage",
        routePath: "organization",
        order: 20
      },
      {
        type: "detailTab",
        id: "room-chat",
        entityTypes: ["issue"],
        displayName: "Room Chat",
        exportName: "RoomChatTab",
        order: 90
      }
    ]
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      spsApiUrl: {
        type: "string",
        title: "SPS API URL",
        description: "Loopback SPS API URL used for durable Room documents and attachment staging.",
        default: "http://127.0.0.1:3100"
      },
      enableAgyQuotaFallback: {
        type: "boolean",
        description: "Opt in to continuing a Codex Room turn through Agy when the selected Codex account reaches provider quota. Disabled by default because this changes the selected provider and cost boundary.",
        default: false
      },
      agyFallbackCommand: {
        type: "string",
        description: "Optional Agy CLI command used for Codex quota fallback. The installed per-user Agy executable is detected by default."
      },
      agyFallbackModel: {
        type: "string",
        description: "Agy model used for reasoning-agent quota fallback.",
        default: "gemini-3.1-pro-high"
      },
      agyFallbackPrintTimeout: {
        type: "string",
        description: "Agy CLI print-mode wait used for long-running reasoning-agent fallback turns.",
        default: "2h"
      }
    }
  }
};

// src/codex-app-server-client.js
import { spawn as defaultSpawn } from "node:child_process";
import { createInterface as createInterface2 } from "node:readline";
function defaultProcessSpawn(command, args, options) {
  if (process.platform === "win32" && String(command).trim().toLowerCase() === "codex") {
    return defaultSpawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `codex ${args.join(" ")}`], options);
  }
  return defaultSpawn(command, args, options);
}
function makeError(message, data = null) {
  const error = new Error(message);
  error.data = data;
  return error;
}
var CodexAppServerClient = class {
  constructor({ command = "codex", args = ["app-server", "--stdio"], cwd, env = null, spawn = defaultProcessSpawn, requestTimeoutMs = 3e4, turnIdleTimeoutMs = 3e5, onServerRequest = null } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.spawn = spawn;
    this.requestTimeoutMs = requestTimeoutMs;
    this.turnIdleTimeoutMs = turnIdleTimeoutMs;
    this.onServerRequest = onServerRequest;
    this.child = null;
    this.pending = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.completedTurns = /* @__PURE__ */ new Map();
    this.completedTurnItems = /* @__PURE__ */ new Map();
    this.requestId = 1;
    this.starting = null;
  }
  onNotification(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async start() {
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.#start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async #start() {
    const child = this.spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env ?? process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    const lineReader = createInterface2({ input: child.stdout });
    lineReader.on("line", (line) => this.#handleLine(line));
    child.stderr.on("data", () => {
    });
    child.once("exit", () => {
      if (this.child === child) this.child = null;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(makeError("Codex app-server exited before responding."));
      }
      this.pending.clear();
      this.completedTurns.clear();
      this.completedTurnItems.clear();
      for (const listener of [...this.listeners]) listener({ method: "server/exited", params: {} });
    });
    await this.request("initialize", {
      clientInfo: {
        name: "paperclip_room_chat",
        title: "SPS Room Chat",
        version: "0.1.0"
      },
      // Room Task tools are negotiated through Codex's experimental dynamicTools API.
      capabilities: { experimentalApi: true }
    });
    this.notify("initialized", {});
  }
  async request(method, params) {
    await this.start();
    const id = this.requestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(makeError(`Codex app-server request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.#send({ id, method, params });
    });
  }
  notify(method, params) {
    this.#send({ method, params });
  }
  async openRoomThread({ threadId, cwd, model, developerInstructions, dynamicTools, sandbox = "danger-full-access", approvalPolicy = "never" }) {
    const common = {
      cwd,
      ...model ? { model } : {},
      ...developerInstructions ? { developerInstructions } : {},
      sandbox,
      approvalPolicy
    };
    if (threadId) {
      const resumed = await this.request("thread/resume", { threadId, ...common });
      return resumed.thread;
    }
    const started = await this.request("thread/start", {
      ...common,
      dynamicTools
    });
    return started.thread;
  }
  async startTurn({ threadId, text: text4, input = null, onProgress = null, approvalPolicy = "never", sandboxPolicy = { type: "dangerFullAccess" }, effort = null, summary = null }) {
    let turnId = null;
    const pendingProgress = [];
    const reportProgress = (message) => {
      const params = message.params ?? {};
      if (params.threadId !== threadId) return;
      if (!turnId) {
        pendingProgress.push(message);
        return;
      }
      if (params.turnId && params.turnId !== turnId) return;
      onProgress?.(message);
    };
    const unsubscribe = typeof onProgress === "function" ? this.onNotification((message) => {
      const params = message.params ?? {};
      if (params.threadId !== threadId) return;
      if (["turn/started", "item/started", "item/completed", "turn/completed"].includes(message.method)) reportProgress(message);
    }) : null;
    try {
      const started = await this.request("turn/start", {
        threadId,
        input: input ?? [{ type: "text", text: text4 }],
        approvalPolicy,
        sandboxPolicy,
        ...effort ? { effort } : {},
        ...summary ? { summary } : {}
      });
      turnId = started?.turn?.id;
      if (!turnId) throw makeError("Codex app-server did not return a turn id.");
      onProgress?.({ method: "turn/started", params: { threadId, turnId } });
      for (const message of pendingProgress) reportProgress(message);
      const completion = this.waitForTurn(threadId, turnId).finally(() => unsubscribe?.());
      return { turnId, completion };
    } catch (error) {
      unsubscribe?.();
      throw error;
    }
  }
  async runTurn(options) {
    const started = await this.startTurn(options);
    return await started.completion;
  }
  async compactThread(threadId) {
    const compacted = this.waitForNotification((message) => {
      return message.method === "item/completed" && message.params?.threadId === threadId && message.params?.item?.type === "contextCompaction";
    });
    await this.request("thread/compact/start", { threadId });
    const itemEvent = await compacted;
    const turnId = itemEvent.params?.turnId;
    if (!turnId) return { compacted: true, turn: null };
    const turn = await this.waitForTurn(threadId, turnId);
    return { compacted: true, turn };
  }
  waitForTurn(threadId, turnId) {
    const key = `${threadId}:${turnId}`;
    const completed = this.completedTurns.get(key);
    if (completed) {
      this.completedTurns.delete(key);
      this.completedTurnItems.delete(key);
      return Promise.resolve(completed);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let idleTimer = null;
      let unsubscribe = () => {
      };
      const cleanup = () => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = null;
        unsubscribe();
        this.completedTurns.delete(key);
        this.completedTurnItems.delete(key);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const armIdleTimer = () => {
        if (!(this.turnIdleTimeoutMs > 0) || settled) return;
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(makeError(`Codex Room turn stalled for ${this.turnIdleTimeoutMs}ms without progress.`, {
            code: "turn_idle_timeout",
            threadId,
            turnId
          }));
          void this.request("turn/interrupt", { threadId, turnId }).catch(() => this.stop());
        }, this.turnIdleTimeoutMs);
      };
      unsubscribe = this.onNotification((message) => {
        if (message.method === "server/exited") {
          fail(makeError("Codex app-server exited before the Room turn completed."));
          return;
        }
        const params = message.params ?? {};
        if (params.threadId !== threadId) return;
        const eventTurnId = params.turnId ?? params.turn?.id;
        if (eventTurnId && eventTurnId !== turnId) return;
        armIdleTimer();
        if (message.method !== "turn/completed" || params.turn?.id !== turnId) return;
        if (settled) return;
        settled = true;
        const turn = this.#turnWithCompletedItems(params);
        cleanup();
        if (turn.status === "failed") {
          reject(makeError(turn.error?.message || "Codex Room turn failed.", turn.error));
          return;
        }
        resolve(turn);
      });
      armIdleTimer();
    });
  }
  waitForNotification(predicate) {
    return new Promise((resolve) => {
      const unsubscribe = this.onNotification((message) => {
        if (!predicate(message)) return;
        unsubscribe();
        resolve(message);
      });
    });
  }
  stop() {
    this.child?.kill();
    this.child = null;
  }
  #send(message) {
    if (!this.child?.stdin?.writable) throw makeError("Codex app-server is not running.");
    this.child.stdin.write(`${JSON.stringify(message)}
`);
  }
  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(makeError(message.error.message || "Codex app-server error.", message.error));
      else pending.resolve(message.result);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
      this.#handleServerRequest(message);
      return;
    }
    if (message.method === "item/completed") {
      this.#recordCompletedItem(message.params);
    }
    if (message.method === "turn/completed") {
      const params = message.params ?? {};
      if (params.threadId && params.turn?.id) {
        this.completedTurns.set(`${params.threadId}:${params.turn.id}`, this.#turnWithCompletedItems(params));
      }
    }
    for (const listener of this.listeners) listener(message);
  }
  async #handleServerRequest(message) {
    try {
      if (!this.onServerRequest) throw makeError(`Unhandled Codex app-server request: ${message.method}`);
      const result = await this.onServerRequest(message);
      this.#send({ id: message.id, result });
    } catch (error) {
      this.#send({
        id: message.id,
        error: { code: -32e3, message: error instanceof Error ? error.message : String(error) }
      });
    }
  }
  #recordCompletedItem(params) {
    const threadId = params?.threadId;
    const turnId = params?.turnId;
    const item = params?.item;
    if (!threadId || !turnId || !item) return;
    const key = `${threadId}:${turnId}`;
    const items = this.completedTurnItems.get(key) ?? [];
    if (!items.some((existing) => existing?.id && item?.id && existing.id === item.id)) items.push(item);
    this.completedTurnItems.set(key, items);
  }
  #turnWithCompletedItems(params) {
    const turn = params?.turn ?? {};
    const key = `${params?.threadId}:${turn.id}`;
    const inlineItems = Array.isArray(turn.items) ? turn.items : [];
    const completedItems = this.completedTurnItems.get(key) ?? [];
    const items = [...inlineItems];
    for (const item of completedItems) {
      if (!items.some((existing) => existing?.id && item?.id && existing.id === item.id)) items.push(item);
    }
    return { ...turn, items };
  }
};
function getAgentText(turn) {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  return items.filter((item) => item?.type === "agentMessage" && typeof item.text === "string").map((item) => item.text).join("\n").trim();
}

// src/agy-room-client.js
import { spawn as defaultSpawn2 } from "node:child_process";
import { randomUUID } from "node:crypto";
function makeError2(message) {
  return new Error(message);
}
var AGY_PROVIDER_QUOTA_RE = /(?:resource_exhausted|quota|rate[-\s]?limit|too many requests|\b429\b|billing details|usage limit)/i;
function outputError(exitCode, stdout, stderr) {
  const detail = String(stderr || stdout || "Agy returned no diagnostic output.").trim().replace(/\s+/g, " ").slice(0, 600);
  const error = makeError2(`Agy CLI exited with code ${exitCode ?? -1}: ${detail}`);
  if (AGY_PROVIDER_QUOTA_RE.test(`${stdout}
${stderr}`)) {
    error.code = "provider_quota";
    error.errorFamily = "provider_quota";
  }
  return error;
}
function utf8Buffer(chunk) {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
}
function decodeUtf8(chunks, streamName) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw makeError2(`Agy CLI emitted invalid UTF-8 on ${streamName}; the response was not saved to avoid corrupted text.`);
  }
}
var AgyRoomClient = class {
  constructor({ command = "agy", argsPrefix = [], cwd, env = process.env, model = null, sandbox = false, extraArgs = [], spawn = defaultSpawn2, requestTimeoutMs = 0 } = {}) {
    this.command = command;
    this.argsPrefix = Array.isArray(argsPrefix) ? argsPrefix.filter(Boolean) : [];
    this.cwd = cwd;
    this.env = env;
    this.model = model;
    this.sandbox = sandbox;
    this.extraArgs = Array.isArray(extraArgs) ? extraArgs.filter(Boolean) : [];
    this.spawn = spawn;
    this.requestTimeoutMs = requestTimeoutMs;
    this.children = /* @__PURE__ */ new Set();
    this.kind = "agy_print";
  }
  startTurn({ prompt }) {
    const turnId = `agy-${randomUUID()}`;
    const args = [...this.argsPrefix, "--print"];
    if (this.sandbox) args.push("--sandbox");
    else args.push("--dangerously-skip-permissions");
    args.push(...this.extraArgs);
    const env = { ...this.env };
    if (this.model && this.model !== "auto") env.ANTIGRAVITY_MODEL = this.model;
    const completion = new Promise((resolve, reject) => {
      let child;
      try {
        child = this.spawn(this.command, args, {
          cwd: this.cwd,
          env,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        reject(error);
        return;
      }
      this.children.add(child);
      if (!child.stdin) {
        child.kill();
        this.children.delete(child);
        reject(makeError2("Agy CLI stdin is unavailable."));
        return;
      }
      child.stdin.on("error", () => {
      });
      child.stdin.end(String(prompt ?? ""), "utf8");
      const stdoutChunks = [];
      const stderrChunks = [];
      let timedOut = false;
      const timer = this.requestTimeoutMs > 0 ? setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.requestTimeoutMs) : null;
      child.stdout?.on("data", (chunk) => {
        stdoutChunks.push(utf8Buffer(chunk));
      });
      child.stderr?.on("data", (chunk) => {
        stderrChunks.push(utf8Buffer(chunk));
      });
      child.once("error", (error) => {
        if (timer) clearTimeout(timer);
        this.children.delete(child);
        reject(error);
      });
      child.once("close", (exitCode) => {
        if (timer) clearTimeout(timer);
        this.children.delete(child);
        if (timedOut) return reject(makeError2(`Agy CLI timed out after ${Math.round(this.requestTimeoutMs / 1e3)} seconds.`));
        let stdout;
        let stderr;
        try {
          stdout = decodeUtf8(stdoutChunks, "stdout");
          stderr = decodeUtf8(stderrChunks, "stderr");
        } catch (error) {
          return reject(error);
        }
        if (exitCode !== 0) return reject(outputError(exitCode, stdout, stderr));
        const text4 = stdout.trim();
        if (!text4) return reject(makeError2("Agy CLI completed without an assistant message."));
        resolve({
          items: [{ id: `message-${turnId}`, type: "agentMessage", text: text4 }],
          provider: "agy",
          turnId
        });
      });
    });
    return { turnId, completion };
  }
  stop() {
    for (const child of this.children) child.kill();
    this.children.clear();
  }
};

// src/organization-legacy-compatibility.js
var LEGACY_LEAD_ROLE_IDS = /* @__PURE__ */ new Set(["manager", "ceo", "designer", "cto"]);
var LEGACY_WORKER_ROLE_IDS = /* @__PURE__ */ new Set([
  "code-worker",
  "qa-worker",
  "image-worker",
  "voice-worker",
  "document-worker",
  "art-worker"
]);
var LEGACY_WORKER_NAMES = /* @__PURE__ */ new Set([
  "code worker",
  "qa worker",
  "image worker",
  "art worker",
  "voice worker",
  "document worker"
]);
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return value === void 0 || value === null ? "" : String(value).trim();
}
function legacyRoleId(agent) {
  const config = asRecord(agent?.adapterConfig);
  const role = text(
    config.managedWorkplaneRole || config.workplaneRole || asRecord(agent?.metadata).managedWorkplaneRole
  ).toLowerCase();
  if (role) return role;
  const paperclipRole = text(agent?.role).toLowerCase();
  if (LEGACY_LEAD_ROLE_IDS.has(paperclipRole) || LEGACY_WORKER_ROLE_IDS.has(paperclipRole)) {
    return paperclipRole;
  }
  const name = text(agent?.name).toLowerCase().replace(/\s+/g, " ");
  return LEGACY_WORKER_NAMES.has(name) ? "legacy-worker" : "";
}
function resolveLegacyWorkplaneIdentity(agent) {
  const roleId = legacyRoleId(agent);
  const kind = LEGACY_LEAD_ROLE_IDS.has(roleId) ? "lead" : LEGACY_WORKER_ROLE_IDS.has(roleId) || roleId === "legacy-worker" ? "worker" : "";
  return { kind, legacyRoleId: roleId || null };
}

// src/organization-policy.js
var WORKPLANE_CAPABILITIES = Object.freeze({
  TASK_CREATE: "task.create",
  TASK_ASSIGN: "task.assign",
  TASK_REVIEW: "task.review",
  TASK_COMPLETE: "task.complete",
  TASK_EXECUTE: "task.execute"
});
var LEAD_CAPABILITIES = Object.freeze([
  WORKPLANE_CAPABILITIES.TASK_CREATE,
  WORKPLANE_CAPABILITIES.TASK_ASSIGN,
  WORKPLANE_CAPABILITIES.TASK_REVIEW,
  WORKPLANE_CAPABILITIES.TASK_COMPLETE
]);
var WORKER_CAPABILITIES = Object.freeze([
  WORKPLANE_CAPABILITIES.TASK_EXECUTE
]);
var HYBRID_CAPABILITIES = Object.freeze([
  ...LEAD_CAPABILITIES,
  ...WORKER_CAPABILITIES
]);
var VALID_KINDS = /* @__PURE__ */ new Set(["lead", "worker", "hybrid"]);
var VALID_MEMORY_ACCESS = /* @__PURE__ */ new Set(["read_write", "read", "none"]);
var VALID_REVIEW_MODES = /* @__PURE__ */ new Set(["automatic", "manual"]);
var WORKPLANE_MEMORY_ACCESS = Object.freeze({
  READ_WRITE: "read_write",
  READ: "read",
  NONE: "none"
});
var WORKPLANE_REVIEW_MODES = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL: "manual"
});
function asRecord2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text2(value) {
  return value === void 0 || value === null ? "" : String(value).trim();
}
function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.map((entry) => text2(entry)).filter(Boolean))] : [];
}
function isResolvedWorkplaneIdentity(value) {
  return Array.isArray(value?.capabilities);
}
function defaultCapabilities(kind) {
  if (kind === "lead") return [...LEAD_CAPABILITIES];
  if (kind === "worker") return [...WORKER_CAPABILITIES];
  if (kind === "hybrid") return [...HYBRID_CAPABILITIES];
  return [];
}
function defaultMemoryAccess(kind) {
  return kind === "worker" ? WORKPLANE_MEMORY_ACCESS.READ : WORKPLANE_MEMORY_ACCESS.READ_WRITE;
}
function defaultReviewMode() {
  return WORKPLANE_REVIEW_MODES.AUTOMATIC;
}
function resolveAgentWorkplaneIdentity(agent) {
  const config = asRecord2(asRecord2(agent?.adapterConfig).workplane);
  const metadataConfig = asRecord2(asRecord2(agent?.metadata).workplane);
  const source = Object.keys(config).length ? config : metadataConfig;
  const configuredKind = text2(source.kind).toLowerCase();
  const configuredRoleId = text2(source.roleId).toLowerCase();
  const legacy = resolveLegacyWorkplaneIdentity(agent);
  const kind = VALID_KINDS.has(configuredKind) ? configuredKind : legacy.kind;
  const capabilities = stringList(source.capabilities);
  const assignableRoleIds = stringList(source.assignableRoleIds);
  const configuredMemoryAccess = text2(source.memoryAccess).toLowerCase();
  const configuredReviewMode = text2(source.reviewMode).toLowerCase();
  return {
    roleId: configuredRoleId || (kind ? kind : "unconfigured"),
    kind: kind || "unconfigured",
    capabilities: capabilities.length ? capabilities : defaultCapabilities(kind),
    assignableRoleIds: assignableRoleIds.length ? assignableRoleIds : kind === "lead" || kind === "hybrid" ? ["worker", "hybrid"] : [],
    memoryAccess: VALID_MEMORY_ACCESS.has(configuredMemoryAccess) ? configuredMemoryAccess : defaultMemoryAccess(kind),
    reviewMode: VALID_REVIEW_MODES.has(configuredReviewMode) ? configuredReviewMode : defaultReviewMode(),
    source: configuredKind || configuredRoleId || capabilities.length || assignableRoleIds.length || configuredMemoryAccess || configuredReviewMode ? "configured" : kind ? "legacy" : "unconfigured",
    legacyRoleId: legacy.legacyRoleId
  };
}
function hasWorkplaneCapability(identityOrAgent, capability) {
  const identity = isResolvedWorkplaneIdentity(identityOrAgent) ? identityOrAgent : resolveAgentWorkplaneIdentity(identityOrAgent);
  return identity.capabilities.includes(capability);
}
function canDelegateTo(ownerIdentityOrAgent, workerIdentityOrAgent) {
  const owner = isResolvedWorkplaneIdentity(ownerIdentityOrAgent) ? ownerIdentityOrAgent : resolveAgentWorkplaneIdentity(ownerIdentityOrAgent);
  const worker = isResolvedWorkplaneIdentity(workerIdentityOrAgent) ? workerIdentityOrAgent : resolveAgentWorkplaneIdentity(workerIdentityOrAgent);
  if (!hasWorkplaneCapability(owner, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) return false;
  if (!hasWorkplaneCapability(worker, WORKPLANE_CAPABILITIES.TASK_EXECUTE)) return false;
  const allowed = new Set(owner.assignableRoleIds);
  return allowed.has("*") || allowed.has(worker.roleId) || allowed.has(worker.kind);
}
function isWorkplaneWorker(agent) {
  return hasWorkplaneCapability(agent, WORKPLANE_CAPABILITIES.TASK_EXECUTE);
}

// src/organization-templates.js
var LEAD_POLICY = Object.freeze({
  roleId: "lead",
  kind: "lead",
  assignableRoleIds: ["worker", "hybrid"],
  memoryAccess: "read_write",
  reviewMode: "automatic"
});
var WORKER_POLICY = Object.freeze({
  roleId: "worker",
  kind: "worker",
  assignableRoleIds: [],
  memoryAccess: "read",
  reviewMode: "automatic"
});
var GAME_STUDIO_LEAD_ROLES = /* @__PURE__ */ new Set(["manager", "ceo", "designer", "cto"]);
var GAME_STUDIO_WORKER_ROLES = /* @__PURE__ */ new Set([
  "engineer",
  "qa",
  "general",
  "code-worker",
  "qa-worker",
  "image-worker",
  "voice-worker",
  "document-worker",
  "art-worker"
]);
var WEB_APP_LEAD_ROLES = /* @__PURE__ */ new Set([
  "product",
  "product-lead",
  "product-manager",
  "technical-lead",
  "tech-lead",
  "engineering-lead",
  "cto"
]);
var WEB_APP_WORKER_ROLES = /* @__PURE__ */ new Set([
  "frontend",
  "frontend-worker",
  "backend",
  "backend-worker",
  "mobile",
  "mobile-worker",
  "qa",
  "qa-worker",
  "documentation",
  "documentation-worker",
  "document",
  "document-worker",
  "devops",
  "devops-worker"
]);
var SMALL_TEAM_LEAD_ROLES = /* @__PURE__ */ new Set(["project-lead", "lead", "manager"]);
var SMALL_TEAM_WORKER_ROLES = /* @__PURE__ */ new Set(["generalist", "generalist-worker", "qa", "qa-worker"]);
var ORGANIZATION_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "lead-worker",
    displayName: "Custom Lead + Worker",
    description: "A blank, general-purpose organization. Assign each Agent its Lead, Worker, or Hybrid policy in the rows below.",
    actionable: false
  }),
  Object.freeze({
    id: "web-app-starter",
    displayName: "Web / App starter",
    description: "Sets recognized product and technical leads to Lead, and frontend, backend, mobile, QA, documentation, and DevOps Agents to Worker. Each Lead can delegate to the shared Worker pool.",
    actionable: true,
    actionLabel: "Apply Web / App starter"
  }),
  Object.freeze({
    id: "small-team-starter",
    displayName: "Small team starter",
    description: "Sets recognized project leads to Lead and generalist or QA Agents to Worker. Use it for a lightweight, domain-neutral delivery team.",
    actionable: true,
    actionLabel: "Apply small team starter"
  }),
  Object.freeze({
    id: "game-studio-compatibility",
    displayName: "Legacy Workplane migration",
    description: "Migrates a recognized legacy Lead and Worker setup to explicit generic Workplane policies without changing rooms or Tasks.",
    actionable: true,
    actionLabel: "Migrate legacy policy",
    visibleWhenEligible: true
  })
]);
function text3(value) {
  return value === void 0 || value === null ? "" : String(value).trim();
}
function configuredWorkplane(agent) {
  const config = agent?.adapterConfig?.workplane;
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}
function hasExplicitWorkplane(agent) {
  const config = configuredWorkplane(agent);
  const memoryAccess = text3(config.memoryAccess).toLowerCase();
  const reviewMode = text3(config.reviewMode).toLowerCase();
  return Boolean(
    text3(config.kind) && text3(config.roleId) && Array.isArray(config.assignableRoleIds) && (/* @__PURE__ */ new Set(["read_write", "read", "none"])).has(memoryAccess) && (/* @__PURE__ */ new Set(["automatic", "manual"])).has(reviewMode)
  );
}
function clonePolicy(policy) {
  return {
    roleId: policy.roleId,
    kind: policy.kind,
    assignableRoleIds: [...policy.assignableRoleIds],
    memoryAccess: policy.memoryAccess,
    reviewMode: policy.reviewMode
  };
}
function normalizedRoleId(value) {
  const roleId = text3(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return roleId || null;
}
function starterPolicyForAgent(agent, leadRoles, workerRoles) {
  const roleId = normalizedRoleId(agent?.role);
  if (!roleId) return null;
  if (leadRoles.has(roleId)) {
    return {
      ...clonePolicy(LEAD_POLICY),
      roleId,
      assignableRoleIds: ["*"]
    };
  }
  if (workerRoles.has(roleId)) {
    return {
      ...clonePolicy(WORKER_POLICY),
      roleId
    };
  }
  return null;
}
function gameStudioPolicyForAgent(agent) {
  const paperclipRole = text3(agent?.role).toLowerCase();
  if (GAME_STUDIO_LEAD_ROLES.has(paperclipRole)) return clonePolicy(LEAD_POLICY);
  if (GAME_STUDIO_WORKER_ROLES.has(paperclipRole)) return clonePolicy(WORKER_POLICY);
  return null;
}
function policyForTemplateAgent(templateId, agent) {
  if (templateId === "game-studio-compatibility") return gameStudioPolicyForAgent(agent);
  if (templateId === "web-app-starter") {
    return starterPolicyForAgent(agent, WEB_APP_LEAD_ROLES, WEB_APP_WORKER_ROLES);
  }
  if (templateId === "small-team-starter") {
    return starterPolicyForAgent(agent, SMALL_TEAM_LEAD_ROLES, SMALL_TEAM_WORKER_ROLES);
  }
  return null;
}
function listOrganizationTemplates() {
  return ORGANIZATION_TEMPLATES.map((template) => ({ ...template }));
}
function resolveOrganizationTemplate(templateId, agents) {
  const template = ORGANIZATION_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error("Organization template was not found.");
  const assignments = [];
  const skippedConfiguredAgentIds = [];
  const unmatchedAgentIds = [];
  for (const agent of Array.isArray(agents) ? agents : []) {
    if (!agent?.id) continue;
    if (hasExplicitWorkplane(agent)) {
      skippedConfiguredAgentIds.push(agent.id);
      continue;
    }
    const policy = policyForTemplateAgent(template.id, agent);
    if (!policy) {
      unmatchedAgentIds.push(agent.id);
      continue;
    }
    assignments.push({ agentId: agent.id, policy });
  }
  return {
    template: { ...template },
    assignments,
    skippedConfiguredAgentIds,
    unmatchedAgentIds
  };
}

// src/worker.js
import { execFileSync } from "node:child_process";
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import fs2 from "node:fs";
import os from "node:os";
import path2 from "node:path";
var ROOM_STATE_KEY = "ROOM_STATE";
var ROOM_WORK_STATE_KEY = "ROOM_WORK_STATE";
var ROOM_CHECKPOINTS_KEY = "ROOM_CHECKPOINTS";
var ROOM_MEMORY_LIFECYCLE_RECONCILE_KEY = "room-memory-lifecycle-reconcile-v1";
var ROOM_NATIVE_COMPACTIONS_KEY = "ROOM_NATIVE_COMPACTIONS";
var TASK_ROOM_STATE_KEY = "TASK_ROOM_STATE";
var ROOM_PREFIX = "[Agent Room] ";
var PROVISIONED_AGENT_ROOM_ORIGIN = "plugin:local.room-chat:agent-room-provisioning";
var AGENT_ROOM_OPERATION_ORIGIN = "plugin:local.room-chat:operation:agent-room";
var ROOM_JOB_ENTITY_TYPE = "room_job";
var WORKSPACE_PROFILE_ENTITY_TYPE = "workspace_profile";
var WORKSPACE_PROFILE_EXTERNAL_ID = "workplane-workspace-profile-v1";
var WORKSPACE_PROFILE_VERSION = 1;
var DEFAULT_TASK_TYPE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "design", label: "Design" }),
  Object.freeze({ id: "documentation", label: "Documentation" }),
  Object.freeze({ id: "implementation", label: "Implementation" }),
  Object.freeze({ id: "qa", label: "Quality assurance" }),
  Object.freeze({ id: "art", label: "Art / assets" }),
  Object.freeze({ id: "voice", label: "Voice / audio" })
]);
var TASK_TYPE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
var ACTIVE_ROOM_JOB_STATUSES = /* @__PURE__ */ new Set(["queued", "starting", "working"]);
var ROOM_ATTACHMENT_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1e3;
var ROOM_CONTEXT_RECOVERY_COMMENT_LIMIT = 120;
var ROOM_CONTEXT_RECOVERY_CHAR_LIMIT = 6e4;
var ROOM_CONTEXT_RECOVERY_ENTRY_LIMIT = 5e3;
var LOCAL_MEMORY_SIDECAR_CONFIG_URL = new URL("../../memory-sidecar/config.local.json", import.meta.url);
var ROOM_MEMORY_SCOPES = /* @__PURE__ */ new Set(["company", "project", "agent"]);
var ROOM_WAITING_KINDS = /* @__PURE__ */ new Set(["none", "user", "worker", "environment", "task_review"]);
var ROOM_READY_STATUS = "todo";
var TERMINAL_STATUSES = /* @__PURE__ */ new Set(["done", "blocked", "cancelled"]);
var ACTIVE_TASK_STATUSES = /* @__PURE__ */ new Set(["backlog", "todo", "pending", "queued", "running", "in_progress", "in_review"]);
var TASK_WORKER_RETRY_STOP_STATUSES = /* @__PURE__ */ new Set(["in_review", "done", "cancelled"]);
var TASK_STATUS_ORDER = /* @__PURE__ */ new Map([["in_progress", 0], ["todo", 1], ["backlog", 2], ["in_review", 3], ["blocked", 4], ["done", 5], ["cancelled", 6]]);
var TASK_MATURITY_LEVELS = /* @__PURE__ */ new Set(["exploration", "prototype", "committed implementation"]);
var TASK_OWNER_REPORT_STATUSES = /* @__PURE__ */ new Set(["in_review", "blocked"]);
var PROVIDER_QUOTA_ERROR_CODE = "provider_quota";
var AUTOMATIC_PROVIDER_QUOTA_RETRY_ENABLED = false;
var ROOM_CHAT_TEST_MODE = process.env.SPS_ROOM_CHAT_TEST === "1" || process.env.PAPERCLIP_ROOM_CHAT_TEST === "1";
var PROVIDER_QUOTA_RETRY_INTERVAL_MS = ROOM_CHAT_TEST_MODE ? 50 : 30 * 60 * 1e3;
var TASK_ROOM_EXECUTION_POLICY = Object.freeze({
  mode: "normal",
  commentRequired: true,
  stages: [],
  failure: Object.freeze({
    automaticRetry: false,
    preserveAssignee: true,
    wakeRecoveryOwner: false
  })
});
var TASK_WORKER_DISPOSITION_PENDING_STATUSES = /* @__PURE__ */ new Set(["todo", "pending", "queued", "running", "in_progress"]);
var TASK_WORKER_RUNTIME_RECOVERY_CAUSES = /* @__PURE__ */ new Set(["stranded_assigned_issue", "workspace_validation_failed", "configuration_incomplete"]);
var LEGACY_PROJECT_ROOM_ROLES = Object.freeze([]);
var CODEX_ROOM_SANDBOXES = /* @__PURE__ */ new Set(["read-only", "workspace-write", "danger-full-access"]);
var CODEX_ROOM_APPROVAL_POLICIES = /* @__PURE__ */ new Set(["untrusted", "on-request", "never"]);
var ROOM_MESSAGE_MODES = /* @__PURE__ */ new Set(["agent", "plan", "ask"]);
var roomLocks = /* @__PURE__ */ new Map();
var projectRoomLocks = /* @__PURE__ */ new Map();
var roomDocumentWriteLocks = /* @__PURE__ */ new Map();
var activeThreadContexts = /* @__PURE__ */ new Map();
var nativeCompactionLocks = /* @__PURE__ */ new Map();
var manualCodexCompactionThreads = /* @__PURE__ */ new Set();
var recordedNativeCompactionEvents = /* @__PURE__ */ new Set();
var activeRoomMessageJobs = /* @__PURE__ */ new Map();
var activeTaskOwnerReports = /* @__PURE__ */ new Map();
var processedTaskOwnerReportEvents = /* @__PURE__ */ new Set();
var activeWorkerRuntimeRecoveries = /* @__PURE__ */ new Map();
var activeTaskOwnerBoundaryReconcile = null;
var activeProviderQuotaReconcile = null;
var activeRoomQuotaRetryReconcile = null;
var pluginCtx = null;
var codexClients = /* @__PURE__ */ new Map();
var testCodexClient = null;
var testAgyClientFactory = null;
function asRecord3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function textParam(params, key, fallback = "") {
  const value = asRecord3(params)[key];
  return value === void 0 || value === null ? fallback : String(value).trim();
}
function rawTextParam(params, key, fallback = "") {
  const value = asRecord3(params)[key];
  return value === void 0 || value === null ? fallback : String(value);
}
function listParam(params, key) {
  const value = asRecord3(params)[key];
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
}
function normalizedTaskTypeKey(value, fallback = "") {
  const key = String(value || "").trim().toLowerCase();
  return TASK_TYPE_KEY_PATTERN.test(key) ? key : fallback;
}
function configuredEnvironmentValue(agent, name) {
  const value = asRecord3(asRecord3(agent?.adapterConfig).env)[name];
  if (typeof value === "string") return value.trim();
  return textParam(asRecord3(value), "value");
}
function configuredEnvironment(agent) {
  const env = {};
  for (const [key, raw] of Object.entries(asRecord3(asRecord3(agent?.adapterConfig).env))) {
    const value = typeof raw === "string" ? raw.trim() : textParam(asRecord3(raw), "value");
    if (value) env[key] = value;
  }
  return env;
}
function normalizeCodexHome(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    return path2.resolve(source).replace(/[\\/]+$/, "").toLowerCase();
  } catch {
    return source.replace(/[\\/]+$/, "").toLowerCase();
  }
}
function codexAccountLabel(directoryName) {
  const name = String(directoryName || "").trim();
  if (name === ".codex") return "Default Codex account";
  const suffix = name.replace(/^\.codex-?/, "").replace(/[-_]+/g, " ").trim();
  if (!suffix) return "Codex account";
  return `${suffix.replace(/\b\w/g, (character) => character.toUpperCase())} Codex account`;
}
function localCodexAccounts(homeDirectory = os.homedir()) {
  const root = path2.resolve(homeDirectory);
  let entries = [];
  try {
    entries = fs2.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory() && (entry.name === ".codex" || entry.name.startsWith(".codex-"))).map((entry) => {
    const accountHome = path2.join(root, entry.name);
    return {
      id: `codex-home:${entry.name}`,
      label: codexAccountLabel(entry.name),
      directoryName: entry.name,
      home: accountHome,
      hasAuth: fs2.existsSync(path2.join(accountHome, "auth.json"))
    };
  }).filter((account) => account.hasAuth).sort((left, right) => left.directoryName === ".codex" ? -1 : right.directoryName === ".codex" ? 1 : left.label.localeCompare(right.label));
}
function applyCodexAccountToAdapterConfig(agent, account) {
  const adapterConfig = asRecord3(agent?.adapterConfig);
  const existingEnv = asRecord3(adapterConfig.env);
  return {
    ...adapterConfig,
    codexAccount: account.directoryName,
    env: {
      ...existingEnv,
      CODEX_HOME: { type: "plain", value: account.home }
    }
  };
}
function codexRoomSandbox(value) {
  const normalized = String(value || "").trim();
  return CODEX_ROOM_SANDBOXES.has(normalized) ? normalized : "danger-full-access";
}
function codexRoomApprovalPolicy(value) {
  const normalized = String(value || "").trim();
  return CODEX_ROOM_APPROVAL_POLICIES.has(normalized) ? normalized : "never";
}
function codexTurnSandboxPolicy(sandbox) {
  if (sandbox === "read-only") return { type: "readOnly", networkAccess: false };
  if (sandbox === "workspace-write") return { type: "workspaceWrite", networkAccess: false, writableRoots: [] };
  return { type: "dangerFullAccess" };
}
function roomMessageMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ROOM_MESSAGE_MODES.has(normalized) ? normalized : "agent";
}
function roomMessageModeLabel(value) {
  const mode = roomMessageMode(value);
  return mode === "ask" ? "Ask mode" : mode === "plan" ? "Plan mode" : "Agent mode";
}
function roomModeInstruction(value) {
  const mode = roomMessageMode(value);
  if (mode === "ask") {
    return "ASK MODE: Answer, explain, or review only. Do not edit files, run mutating commands, create or modify Tasks, save memory, or call SPS tools. State any information you cannot answer from the current Room context.";
  }
  if (mode === "plan") {
    return "PLAN MODE: Inspect the available context and produce a concrete plan only. Do not edit files, run mutating commands, create or modify Tasks, or save memory. You may use read-only SPS context tools when necessary.";
  }
  return "AGENT MODE: Work within your AGENTS.md role rules. Use SPS tools directly only when the user has authorized the relevant action.";
}
function roomModeSandbox(runtime, mode) {
  return roomMessageMode(mode) === "agent" ? runtime?.sandbox || "danger-full-access" : "read-only";
}
function isWorkerOnlyRoomAgent(agent) {
  return resolveAgentWorkplaneIdentity(agent).kind === "worker";
}
function roomWorkplaneBoundary(agent) {
  const identity = resolveAgentWorkplaneIdentity(agent);
  if (identity.kind !== "worker") return "";
  return [
    "LONG-LIVED WORKER ROOM BOUNDARY.",
    "This is a durable conversation and read-only context Room, not an assigned Task Room.",
    "You may answer questions, inspect available context, clarify scope, and propose an implementation or asset plan.",
    "Do not modify repository or workspace files, generate or publish production assets, run builds or mutating automation, call external production services, or perform implementation work from this Room.",
    "Do not create, assign, reassign, review, or complete Tasks. When asked to carry out production work, state that a Lead must first create and assign a finite Task, then wait for that Task Room."
  ].join(" ");
}
function roomRuntimeWithRoomSafety(agent, runtime) {
  if (!isWorkerOnlyRoomAgent(agent)) return runtime;
  if (runtime?.kind === "agy_print") return { ...runtime, sandbox: true };
  return { ...runtime, sandbox: "read-only", approvalPolicy: "never" };
}
function isRoomCliRuntimeAgent(agent) {
  const adapterType = textParam(agent, "adapterType");
  return adapterType === "codex_local" || adapterType === "antigravity_local";
}
function effectiveRoomMessageMode(agent, requestedMode = "agent") {
  return isWorkerOnlyRoomAgent(agent) ? "ask" : roomMessageMode(requestedMode);
}
function workerRoomSandboxDirectory(companyId, issue, agent) {
  const source = [companyId, issue?.projectId, issue?.id, agent?.id].map((value) => String(value || "")).join("\0");
  const key = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const directory = path2.join(os.homedir(), ".sps", "workplane-room-sandboxes", key);
  fs2.mkdirSync(directory, { recursive: true });
  return directory;
}
function roomModeAllowsTool(mode, toolName) {
  const normalized = roomMessageMode(mode);
  if (normalized === "agent") return true;
  if (normalized === "ask") return false;
  return (/* @__PURE__ */ new Set([
    "paperclip.memory_search",
    "paperclip.list_active_tasks",
    "paperclip.list_workers",
    "paperclip.preview_task",
    "paperclip.get_task_context"
  ])).has(toolName);
}
function agentRoomRuntime(runtime, agent) {
  const adapterConfig = asRecord3(agent?.adapterConfig);
  if (textParam(agent, "adapterType") === "antigravity_local") {
    return {
      kind: "agy_print",
      enabled: runtime.enableAgyRooms,
      command: textParam(adapterConfig, "command", "agy"),
      model: textParam(adapterConfig, "model", "auto") || "auto",
      sandbox: adapterConfig.sandbox === true,
      timeoutMs: Math.max(0, Number(adapterConfig.timeoutSec) || 0) * 1e3,
      extraArgs: Array.isArray(adapterConfig.extraArgs) ? adapterConfig.extraArgs : [],
      env: configuredEnvironment(agent)
    };
  }
  return {
    kind: "codex_app_server",
    enabled: runtime.enableCodexRooms,
    command: runtime.command,
    model: textParam(adapterConfig, "model", "") || runtime.model,
    reasoningEffort: textParam(adapterConfig, "modelReasoningEffort", textParam(adapterConfig, "reasoningEffort", "")) || null,
    codexHome: runtime.codexHome,
    sandbox: runtime.codexSandbox,
    approvalPolicy: runtime.codexApprovalPolicy
  };
}
function defaultAgyCommand() {
  const installed = path2.join(os.homedir(), "AppData", "Local", "agy", "bin", "agy.exe");
  return fs2.existsSync(installed) ? installed : "agy";
}
function roomRuntimeDisabledResult(agentRuntime) {
  return {
    ok: false,
    code: `${agentRuntime.kind}_rooms_disabled`,
    message: agentRuntime.kind === "agy_print" ? "Agy Room runtime is disabled. Enable it before sending a live Worker Room message." : "Codex Room runtime is disabled. Configure and enable it before sending a live message."
  };
}
function resolveCodexHomeForAgent(runtime, agent) {
  const configuredAccount = textParam(asRecord3(agent?.adapterConfig), "codexAccount");
  if (/^\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(configuredAccount)) {
    return path2.join(os.homedir(), configuredAccount);
  }
  return configuredEnvironmentValue(agent, "CODEX_HOME") || runtime.codexHome || textParam(process.env, "CODEX_HOME") || null;
}
function codexClientKey(runtime, agent) {
  return JSON.stringify({ command: runtime.command, codexHome: resolveCodexHomeForAgent(runtime, agent) });
}
function roomThreadIdForCodexRuntime(state, runtime, agent, currentInstructionsFingerprint = agentInstructionsFingerprint(agent)) {
  const threadId = textParam(state?.runtime, "codexThreadId") || null;
  if (!threadId) return null;
  const previousInstructionsFingerprint = textParam(state?.runtime, "instructionsFingerprint") || null;
  if (!previousInstructionsFingerprint || previousInstructionsFingerprint !== currentInstructionsFingerprint) return null;
  const previousAccountKey = textParam(state?.runtime, "codexAccountKey") || null;
  const selectedAccountKey = codexClientKey(runtime, agent);
  const hasExplicitHome = Boolean(resolveCodexHomeForAgent(runtime, agent));
  if (previousAccountKey && previousAccountKey !== selectedAccountKey) return null;
  if (!previousAccountKey && hasExplicitHome) return null;
  return threadId;
}
function roomMemoryRuntime() {
  let config;
  try {
    config = JSON.parse(fs2.readFileSync(LOCAL_MEMORY_SIDECAR_CONFIG_URL, "utf8"));
  } catch {
    throw new Error("The local Memory Sidecar companion configuration is unavailable.");
  }
  const host = String(config?.server?.host || "127.0.0.1").trim();
  const port = Number(config?.server?.port || 3188);
  const baseUrl = new URL(`http://${host}:${port}`);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname)) {
    throw new Error("The local Memory Sidecar must use a loopback address.");
  }
  return {
    baseUrl,
    token: String(process.env.MEMORY_SIDECAR_TOKEN || config?.security?.token || "").trim()
  };
}
async function fetchRoomMemory(pathname, options = {}) {
  const runtime = roomMemoryRuntime();
  const url = new URL(pathname, runtime.baseUrl);
  for (const [key, value] of Object.entries(asRecord3(options.searchParams))) {
    if (value !== void 0 && value !== null && String(value).trim() !== "") url.searchParams.set(key, String(value));
  }
  const headers = { accept: "application/json", ...asRecord3(options.headers) };
  if (runtime.token) headers["x-sidecar-token"] = runtime.token;
  const response = await fetch(url, { method: options.method ?? "GET", headers, body: options.body });
  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error("The Memory Sidecar returned an invalid response.");
  }
  if (!response.ok) throw new Error(`Memory Sidecar request failed (HTTP ${response.status}).`);
  return data;
}
async function searchRoomMemory(roomContext, query, requestedScopes, limit) {
  const scopes = requestedScopes.length ? requestedScopes : ["company", "project", "agent"];
  const selectedScopes = [...new Set(scopes.filter((scope) => ROOM_MEMORY_SCOPES.has(scope)))];
  if (!selectedScopes.length) throw new Error("Choose one or more of company, project, or agent memory scopes.");
  const itemsById = /* @__PURE__ */ new Map();
  for (const scope of selectedScopes) {
    if (scope === "project" && !roomContext.projectId) continue;
    const searchParams = { q: query, scope, companyId: roomContext.companyId, limit };
    if (scope === "project") searchParams.projectId = roomContext.projectId;
    if (scope === "agent") searchParams.agentId = roomContext.agentId;
    const result = await fetchRoomMemory("/memory/search", { searchParams });
    for (const item of Array.isArray(result?.items) ? result.items : []) itemsById.set(item.id, item);
  }
  return [...itemsById.values()].sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, limit);
}
async function proposeRoomMemory(roomContext, input) {
  const content = textParam(input, "content");
  const scope = textParam(input, "scope", "project") || "project";
  if (!content || content.length > 4e3) throw new Error("Memory candidate content must be between 1 and 4000 characters.");
  if (!(/* @__PURE__ */ new Set(["company", "project", "agent", "task", "artifact", "user"])).has(scope)) throw new Error("Invalid memory candidate scope.");
  const candidate = await fetchRoomMemory("/memory/candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      scope,
      type: textParam(input, "type", "learning") || "learning",
      tags: listParam(input, "tags").slice(0, 12),
      companyId: roomContext.companyId,
      projectId: roomContext.projectId ?? null,
      agentId: roomContext.agentId,
      issueId: roomContext.issueId,
      source: { kind: "room_chat", roomIssueId: roomContext.issueId, agentName: roomContext.agentName }
    })
  });
  return candidate?.candidate ?? null;
}
function agentRoomOriginId(projectId, agentId) {
  return `project:${projectId}:agent-room:${agentId}`;
}
function agentRoomAgentId(issue) {
  if (![PROVISIONED_AGENT_ROOM_ORIGIN, AGENT_ROOM_OPERATION_ORIGIN].includes(issue?.originKind)) return null;
  const match = String(issue.originId || "").match(/^project:[^:]+:agent-room:(.+)$/);
  return match?.[1] || null;
}
function isAgentRoom(issue) {
  return Boolean(
    agentRoomAgentId(issue) && !issue?.parentId && !issue?.assigneeAgentId && !issue?.assigneeUserId
  );
}
function isLegacyRoleRoom(issue) {
  const legacyOrigin = issue?.originKind === "plugin:local.room-chat:project-room-provisioning" || /^project:[^:]+:role-room:/i.test(String(issue?.originId || ""));
  return Boolean(legacyOrigin && !issue?.parentId && !issue?.assigneeAgentId && !issue?.assigneeUserId);
}
function isLongLivedRoom(issue) {
  return isAgentRoom(issue) || isLegacyRoleRoom(issue);
}
function isHiredAgent(agent) {
  const builtIn = asRecord3(asRecord3(agent?.metadata).paperclipBuiltInAgent);
  return Boolean(
    agent?.id && agent?.name && agent.status !== "terminated" && !textParam(builtIn, "key")
  );
}
function isTaskWorkerAgent(agent) {
  return isHiredAgent(agent) && isWorkplaneWorker(agent);
}
function agentWorkingDirectory(agent) {
  return textParam(asRecord3(agent?.adapterConfig), "cwd");
}
function agentInstructionsPath(agent) {
  const instructionsPath = textParam(asRecord3(agent?.adapterConfig), "instructionsFilePath");
  return instructionsPath && path2.isAbsolute(instructionsPath) ? instructionsPath : "";
}
function loadAgentInstructions(agent) {
  const path3 = agentInstructionsPath(agent);
  if (!path3 || !fs2.existsSync(path3)) {
    return "No managed Agent AGENTS.md was available. Ask the user to configure this Agent's Instructions before making policy decisions.";
  }
  try {
    const body = fs2.readFileSync(path3, "utf8").trim();
    return body || "The managed Agent AGENTS.md is empty.";
  } catch {
    return "The managed Agent AGENTS.md could not be read. Report this blocker before making policy decisions.";
  }
}
function agentInstructionsFingerprint(agent, instructions = loadAgentInstructions(agent)) {
  return createHash("sha256").update(JSON.stringify({
    version: 1,
    agentId: textParam(agent, "id"),
    agentName: textParam(agent, "name"),
    agentRole: textParam(agent, "role"),
    instructions
  }), "utf8").digest("hex");
}
function roomRole(issue) {
  if (!issue?.title?.startsWith(ROOM_PREFIX)) return null;
  const role = issue.title.slice(ROOM_PREFIX.length).trim();
  return role || null;
}
function queueProjectRoomProvision(projectId, work) {
  const previous = projectRoomLocks.get(projectId) ?? Promise.resolve();
  const current = previous.catch(() => {
  }).then(work);
  projectRoomLocks.set(projectId, current.catch(() => {
  }));
  return current;
}
async function provisionProjectAgentRooms(ctx, companyId, projectId) {
  if (!companyId || !projectId) throw new Error("companyId and projectId are required to provision Agent Rooms.");
  return queueProjectRoomProvision(projectId, async () => {
    const [issues, agents] = await Promise.all([
      ctx.issues.list({ companyId, projectId, limit: 500 }),
      ctx.agents.list({ companyId, limit: 200 })
    ]);
    const hiredAgents = agents.filter(isHiredAgent);
    const hiredAgentIds = new Set(hiredAgents.map((agent) => agent.id));
    const retired = [];
    for (const issue of issues) {
      const roomAgentId = agentRoomAgentId(issue);
      if (!roomAgentId || hiredAgentIds.has(roomAgentId) || TERMINAL_STATUSES.has(issue.status)) continue;
      const updated = await ctx.issues.update(issue.id, {
        status: "cancelled",
        description: `${issue.description || ""}

This Room belonged to a SPS built-in or non-hired Agent and is preserved only for history.`.trim()
      }, companyId);
      retired.push(updated);
    }
    const existingAgentIds = new Set(issues.filter((issue) => !TERMINAL_STATUSES.has(issue.status)).map(agentRoomAgentId).filter((agentId) => agentId && hiredAgentIds.has(agentId)));
    const created = [];
    for (const agent of hiredAgents) {
      if (existingAgentIds.has(agent.id)) continue;
      const room = await ctx.issues.create({
        companyId,
        projectId,
        parentId: null,
        title: agent.name,
        description: `Long-lived Agent Room for ${agent.name}. The Room is unassigned and uses this Agent's SPS Instructions.`,
        status: ROOM_READY_STATUS,
        priority: "medium",
        assigneeAgentId: null,
        originKind: AGENT_ROOM_OPERATION_ORIGIN,
        originId: agentRoomOriginId(projectId, agent.id),
        surfaceVisibility: "plugin_operation"
      });
      created.push({ id: room.id, identifier: room.identifier, agentId: agent.id, agentName: agent.name, title: room.title });
    }
    return { created, retired, existingCount: existingAgentIds.size };
  });
}
async function provisionAllProjectAgentRooms(ctx, companyId) {
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  for (const project of projects) {
    await provisionProjectAgentRooms(ctx, companyId, project.id);
  }
}
async function reconcileAllProjectAgentRooms(ctx) {
  const companies = await ctx.companies.list({ limit: 200 });
  const summaries = [];
  for (const company of companies) {
    if (!company?.id) continue;
    await provisionAllProjectAgentRooms(ctx, company.id);
    summaries.push({ companyId: company.id });
  }
  return { companyCount: summaries.length, companies: summaries };
}
async function reconcileRoomMemoryLifecycle(ctx) {
  const summary = { companies: 0, rooms: 0, checkpointsPublished: 0, compactionsPublished: 0, failed: 0 };
  if (!ctx.memory?.publishLifecycle) return summary;
  const companies = await ctx.companies.list({ limit: 200 });
  for (const company of companies) {
    if (!company?.id) continue;
    summary.companies += 1;
    const projects = await ctx.projects.list({ companyId: company.id, limit: 200 });
    for (const project of projects) {
      const issues = await ctx.issues.list({ companyId: company.id, projectId: project.id, limit: 500 });
      for (const room of issues) {
        if (!isAgentRoom(room)) continue;
        summary.rooms += 1;
        try {
          const document = await ctx.issues.documents.get(room.id, ROOM_CHECKPOINTS_KEY, company.id);
          const checkpoints = parseState(document?.body);
          const latest = Array.isArray(checkpoints) ? checkpoints.at(-1) : null;
          const version = Number(latest?.version);
          if (!Number.isInteger(version) || version < 1) continue;
          const marker = await ctx.state.get("issue", room.id, ROOM_MEMORY_LIFECYCLE_RECONCILE_KEY);
          const deliveredVersion = Number(asRecord3(marker)?.checkpointVersion ?? 0);
          if (deliveredVersion >= version) continue;
          await publishRoomMemoryLifecycle(ctx, company.id, room.id, "room.checkpoint", latest);
          summary.checkpointsPublished += 1;
          if (typeof latest.compactedAt === "string" && latest.compactedAt) {
            await publishRoomMemoryLifecycle(ctx, company.id, room.id, "room.compacted", latest);
            summary.compactionsPublished += 1;
          }
          await ctx.state.set("issue", room.id, ROOM_MEMORY_LIFECYCLE_RECONCILE_KEY, {
            checkpointVersion: version,
            reconciledAt: now()
          });
        } catch (error) {
          summary.failed += 1;
          ctx.logger?.warn?.("Room memory lifecycle reconciliation failed.", {
            issueId: room.id,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }
  return summary;
}
async function syncAgentRoomTitles(ctx, companyId, agentId) {
  const agent = await ctx.agents.get(agentId, companyId);
  if (!isHiredAgent(agent)) return;
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  for (const project of projects) {
    const issues = await ctx.issues.list({
      companyId,
      projectId: project.id,
      originId: agentRoomOriginId(project.id, agent.id),
      limit: 10
    });
    for (const room of issues) {
      if (room.title === agent.name) continue;
      await ctx.issues.update(room.id, {
        title: agent.name,
        description: `Long-lived Agent Room for ${agent.name}. The Room is unassigned and uses this Agent's SPS Instructions.`
      }, companyId);
    }
  }
}
async function retireLegacyRoleRooms(ctx, companyId, issues) {
  const retired = [];
  for (const issue of issues) {
    if (!isLegacyRoleRoom(issue) || TERMINAL_STATUSES.has(issue.status)) continue;
    const updated = await ctx.issues.update(issue.id, {
      status: "cancelled",
      description: `${issue.description || ""}

Superseded by one named Agent Room per hired Agent. Preserved for history.`.trim()
    }, companyId);
    retired.push(updated);
  }
  return retired;
}
function normalizedWorkspacePath(value) {
  return String(value || "").trim().replace(/[\\/]+$/g, "").toLowerCase();
}
function workspaceLocalPath(workspace) {
  return String(workspace?.cwd ?? workspace?.path ?? "").trim();
}
function displayTaskPath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}
function normalizeTaskAffectedPaths(paths, workspace) {
  const workspaceRoot = displayTaskPath(workspaceLocalPath(workspace)).replace(/\/+$/g, "");
  const comparableRoot = workspaceRoot.toLowerCase();
  const normalized = [];
  const invalid = [];
  for (const requestedPath of paths) {
    const raw = String(requestedPath || "").trim();
    if (!raw) continue;
    const portable = displayTaskPath(raw);
    const isAbsolute = path2.win32.isAbsolute(raw) || path2.posix.isAbsolute(portable);
    let relative = portable;
    if (isAbsolute) {
      const comparablePath = portable.replace(/\/+$/g, "").toLowerCase();
      if (!comparableRoot || comparablePath !== comparableRoot && !comparablePath.startsWith(`${comparableRoot}/`)) {
        invalid.push({ path: portable, reason: "outside_selected_workspace" });
        continue;
      }
      relative = comparablePath === comparableRoot ? "." : portable.slice(workspaceRoot.length + 1);
    }
    const segments = relative.split("/").filter(Boolean);
    if (segments.includes("..")) {
      invalid.push({ path: portable, reason: "parent_directory_not_allowed" });
      continue;
    }
    const canonical = segments.filter((segment) => segment !== ".").join("/") || ".";
    normalized.push(canonical);
  }
  return { paths: [...new Set(normalized)], invalid };
}
function workspaceIdMap(value, workspaceIds) {
  const result = {};
  for (const [key, rawWorkspaceId] of Object.entries(asRecord3(value))) {
    const workspaceId = String(rawWorkspaceId || "").trim();
    if (key && workspaceIds.has(workspaceId)) result[key] = workspaceId;
  }
  return result;
}
function taskWorkspaceIdMap(value, workspaceIds) {
  const result = {};
  for (const [key, rawWorkspaceId] of Object.entries(asRecord3(value))) {
    const taskType = normalizedTaskTypeKey(key);
    const workspaceId = String(rawWorkspaceId || "").trim();
    if (taskType && workspaceIds.has(workspaceId)) result[taskType] = workspaceId;
  }
  return result;
}
function normalizeWorkspaceTaskTypes(value, taskWorkspaceIds, { useDefaults = true } = {}) {
  const result = /* @__PURE__ */ new Map();
  const configured = Array.isArray(value) ? value : null;
  const source = configured ?? (useDefaults ? DEFAULT_TASK_TYPE_DEFINITIONS : []);
  for (const entry of source) {
    const taskType = normalizedTaskTypeKey(asRecord3(entry).id ?? entry);
    if (!taskType || result.has(taskType)) continue;
    const label = textParam(asRecord3(entry), "label") || taskType;
    result.set(taskType, { id: taskType, label: label.slice(0, 80) });
  }
  for (const taskType of Object.keys(asRecord3(taskWorkspaceIds))) {
    const key = normalizedTaskTypeKey(taskType);
    if (key && !result.has(key)) result.set(key, { id: key, label: key });
  }
  return [...result.values()];
}
function normalizeWorkspaceProfile(value, workspaces = []) {
  const source = asRecord3(value);
  const workspaceIds = new Set((Array.isArray(workspaces) ? workspaces : []).map((workspace) => String(workspace?.id || "")).filter(Boolean));
  const requestedDefault = textParam(source, "defaultWorkspaceId");
  const primaryWorkspaceId = (Array.isArray(workspaces) ? workspaces : []).find((workspace) => workspace?.isPrimary)?.id ?? null;
  const defaultWorkspaceId = workspaceIds.has(requestedDefault) ? requestedDefault : primaryWorkspaceId && workspaceIds.has(primaryWorkspaceId) ? primaryWorkspaceId : [...workspaceIds][0] ?? null;
  const taskWorkspaceIds = taskWorkspaceIdMap(source.taskWorkspaceIds, workspaceIds);
  return {
    version: WORKSPACE_PROFILE_VERSION,
    defaultWorkspaceId,
    agentWorkspaceIds: workspaceIdMap(source.agentWorkspaceIds, workspaceIds),
    taskWorkspaceIds,
    taskTypes: normalizeWorkspaceTaskTypes(source.taskTypes, taskWorkspaceIds, {
      useDefaults: !Array.isArray(source.taskTypes)
    }),
    updatedAt: textParam(source, "updatedAt") || null,
    configured: Boolean(source.configured)
  };
}
async function loadProjectWorkspaceProfile(ctx, projectId, workspaces = []) {
  const fallback = normalizeWorkspaceProfile({}, workspaces);
  if (!projectId || !ctx.entities?.list) return fallback;
  const records = await ctx.entities.list({
    entityType: WORKSPACE_PROFILE_ENTITY_TYPE,
    scopeKind: "project",
    scopeId: projectId,
    externalId: WORKSPACE_PROFILE_EXTERNAL_ID,
    limit: 1
  });
  const record = records[0] ?? null;
  return normalizeWorkspaceProfile(record?.data, workspaces);
}
async function saveProjectWorkspaceProfile(ctx, projectId, profile, workspaces = []) {
  if (!projectId || !ctx.entities?.upsert) throw new Error("SPS plugin storage is unavailable for Workspace Profiles.");
  const normalized = {
    ...normalizeWorkspaceProfile(profile, workspaces),
    configured: true,
    updatedAt: now()
  };
  await ctx.entities.upsert({
    entityType: WORKSPACE_PROFILE_ENTITY_TYPE,
    scopeKind: "project",
    scopeId: projectId,
    externalId: WORKSPACE_PROFILE_EXTERNAL_ID,
    data: normalized
  });
  return normalized;
}
function profileWorkspace(workspaces, profile, { agentId = "", taskType = "", requestedWorkspaceId = "" } = {}) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  if (asRecord3(profile).configured !== true) return null;
  const requested = byId.get(requestedWorkspaceId);
  if (requested) return requested;
  const agentWorkspaceId = textParam(asRecord3(profile).agentWorkspaceIds, agentId);
  if (agentWorkspaceId && byId.has(agentWorkspaceId)) return byId.get(agentWorkspaceId);
  const taskWorkspaceId = textParam(asRecord3(profile).taskWorkspaceIds, normalizedTaskTypeKey(taskType));
  if (taskWorkspaceId && byId.has(taskWorkspaceId)) return byId.get(taskWorkspaceId);
  const defaultWorkspaceId = textParam(profile, "defaultWorkspaceId");
  return defaultWorkspaceId && byId.has(defaultWorkspaceId) ? byId.get(defaultWorkspaceId) : null;
}
function profileTaskWorkspace(workspaces, profile, { agentId = "", taskType = "", requestedWorkspaceId = "" } = {}) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  if (asRecord3(profile).configured !== true) return null;
  const requested = byId.get(requestedWorkspaceId);
  if (requested) return requested;
  const taskWorkspaceId = textParam(asRecord3(profile).taskWorkspaceIds, normalizedTaskTypeKey(taskType));
  return taskWorkspaceId && byId.has(taskWorkspaceId) ? byId.get(taskWorkspaceId) : null;
}
function defaultWorkspaceKindForAgent(agent) {
  const identity = `${agent?.role || ""} ${agent?.name || ""}`.toLowerCase();
  if (/(art|image|voice)/.test(identity)) return "asset";
  if (/(designer|design|manager|document)/.test(identity)) return "design";
  return "implementation";
}
function workspaceKindForProjectWorkspace(workspace) {
  const name = String(workspace?.name || "").toLowerCase();
  const localPath = normalizedWorkspacePath(workspaceLocalPath(workspace));
  const pathName = localPath.split(/[\\/]/).filter(Boolean).at(-1) || "";
  const identity = `${name} ${pathName}`;
  if (/(implementation|unity|unreal|source|code|build|app|server|client)/.test(identity)) return "implementation";
  if (/(asset|art|audio|voice)/.test(identity)) return "asset";
  if (/(design|obsidian|research|reference|spec|docs?)/.test(identity)) return "design";
  if (/(shared|common|library|knowledge)/.test(identity)) return "shared";
  return "implementation";
}
function workspaceKindForTaskType(taskType) {
  if (["design", "documentation"].includes(taskType)) return "design";
  if (["art", "voice"].includes(taskType)) return "asset";
  return "implementation";
}
function taskTypeAllowsNoAffectedPaths(taskType) {
  return ["design", "documentation"].includes(normalizedTaskTypeKey(taskType));
}
function chooseTaskWorkspace(workspaces, taskType, requestedWorkspaceId, profile = null, assigneeAgentId = "") {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const configured = profileTaskWorkspace(workspaces, profile, { agentId: assigneeAgentId, taskType, requestedWorkspaceId });
  if (configured) return configured;
  const kind = workspaceKindForTaskType(taskType);
  const requested = requestedWorkspaceId ? workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ?? null : null;
  const preferred = workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === kind) ?? null;
  const requestedKind = requested ? workspaceKindForProjectWorkspace(requested) : null;
  if (requested && (requestedKind === kind || kind === "asset" && requestedKind === "implementation")) return requested;
  const implementationFallback = kind === "asset" ? workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === "implementation") ?? null : null;
  return preferred ?? implementationFallback ?? profileWorkspace(workspaces, profile, { agentId: "", taskType: "", requestedWorkspaceId: "" }) ?? workspaces.find((workspace) => workspace.isPrimary) ?? workspaces[0];
}
function workspaceBinding(workspace) {
  if (!workspace?.id) return null;
  return {
    projectWorkspaceId: workspace.id,
    name: String(workspace.name || "Workspace"),
    kind: workspaceKindForProjectWorkspace(workspace),
    boundAt: now()
  };
}
async function listProjectWorkspaces(ctx, companyId, projectId) {
  if (!projectId || !ctx.projects?.listWorkspaces) return null;
  return ctx.projects.listWorkspaces(projectId, companyId);
}
function chooseDefaultWorkspace(agent, workspaces, profile = null) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const configuredByProfile = profileWorkspace(workspaces, profile, { agentId: agent?.id });
  if (configuredByProfile) return configuredByProfile;
  const configured = normalizedWorkspacePath(agentWorkingDirectory(agent));
  if (configured) {
    const configuredWorkspace = workspaces.find((workspace) => normalizedWorkspacePath(workspaceLocalPath(workspace)) === configured);
    if (configuredWorkspace) return configuredWorkspace;
  }
  const preferredKind = defaultWorkspaceKindForAgent(agent);
  return workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === preferredKind) ?? workspaces.find((workspace) => workspace.isPrimary) ?? workspaces[0];
}
async function resolveRoomWorkspace(ctx, companyId, issue, agent, state) {
  const workspaces = await listProjectWorkspaces(ctx, companyId, issue.projectId);
  if (workspaces === null) return { workspace: null, workspaces: null, legacy: true };
  const profile = await loadProjectWorkspaceProfile(ctx, issue.projectId, workspaces);
  const currentId = textParam(asRecord3(state?.workspace), "projectWorkspaceId");
  const profileSelectedWorkspace = profileWorkspace(workspaces, profile, { agentId: agent?.id });
  const workspace = profileSelectedWorkspace ?? workspaces.find((entry) => entry.id === currentId) ?? chooseDefaultWorkspace(agent, workspaces, profile);
  return { workspace: workspace ?? null, workspaces, profile, legacy: false };
}
async function ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, state) {
  const resolved = await resolveRoomWorkspace(ctx, companyId, issue, agent, state);
  if (!resolved.workspace) return { state, resolved, changed: false };
  const nextBinding = workspaceBinding(resolved.workspace);
  const currentBinding = asRecord3(state.workspace);
  const changed = currentBinding.projectWorkspaceId !== nextBinding.projectWorkspaceId || currentBinding.kind !== nextBinding.kind || currentBinding.name !== nextBinding.name || Object.hasOwn(state, "workingDirectory");
  if (!changed) return { state, resolved, changed: false };
  state.workspace = nextBinding;
  delete state.workingDirectory;
  state.version = 3;
  return { state, resolved, changed: true };
}
async function resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state) {
  const resolved = await resolveRoomWorkspace(ctx, companyId, issue, agent, state);
  const workspacePath = workspaceLocalPath(resolved.workspace);
  if (workspacePath && fs2.existsSync(workspacePath)) return workspacePath;
  if (resolved.legacy && state.workingDirectory && fs2.existsSync(state.workingDirectory)) {
    return state.workingDirectory;
  }
  if (resolved.workspaces && !resolved.workspaces.length) {
    throw new Error("This Project has no registered Workspace. Add a design or implementation Workspace before starting a Room turn.");
  }
  throw new Error("The Room Workspace is unavailable. Select a registered Project Workspace before starting a Room turn.");
}
function agentSessionContextMatches(session, expectedContext) {
  const context = asRecord3(session?.context);
  return textParam(context, "projectId") === textParam(expectedContext, "projectId") && textParam(context, "projectWorkspaceId") === textParam(expectedContext, "projectWorkspaceId") && !textParam(context, "issueId");
}
async function ensureNativeRoomSession(ctx, companyId, issue, agent, state) {
  const binding = await ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, state);
  const workspace = binding.resolved.workspace;
  if (!workspace?.id) {
    throw new Error("This Project has no registered Workspace. Add a design or implementation Workspace before starting a Room turn.");
  }
  const context = {
    projectId: issue.projectId,
    projectWorkspaceId: workspace.id
  };
  const sessions = await ctx.agents.sessions.list(agent.id, companyId);
  const persistedSessionId = textParam(state.runtime, "agentSessionId");
  let session = sessions.find((candidate) => candidate.sessionId === persistedSessionId) ?? null;
  if (session && !agentSessionContextMatches(session, context)) {
    await ctx.agents.sessions.close(session.sessionId, companyId);
    session = null;
  }
  if (!session) {
    session = sessions.find((candidate) => agentSessionContextMatches(candidate, context)) ?? null;
  }
  if (!session) {
    session = await ctx.agents.sessions.create(agent.id, companyId, {
      reason: `Long-lived Room session for ${agent.name}`,
      context
    });
  }
  state.runtime ??= {};
  state.runtime.kind = "paperclip_agent_session";
  state.runtime.agentSessionId = session.sessionId;
  state.runtime.lastRunId = session.lastRunId ?? state.runtime.lastRunId ?? null;
  state.runtime.lastError = session.lastError ?? null;
  state.runtime.codexThreadId = null;
  state.runtime.model = textParam(asRecord3(agent.adapterConfig), "model") || null;
  state.runtime.updatedAt = now();
  delete state.runtime.codexAccountKey;
  delete state.runtime.codexHome;
  delete state.runtime.agyCommand;
  return {
    session,
    workspace,
    workingDirectory: await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state),
    bindingChanged: binding.changed
  };
}
function nativeSessionResultText(event) {
  const payload = asRecord3(event?.payload);
  if (event?.eventType === "error") {
    const message = textParam(payload, "error") || textParam(payload, "errorCode") || textParam(event, "message") || "The Agent Session run failed.";
    const error = new Error(message);
    const resultRecord2 = asRecord3(payload.resultJson);
    error.code = textParam(payload, "errorCode") || textParam(resultRecord2, "errorCode") || null;
    error.errorFamily = textParam(payload, "errorFamily") || textParam(resultRecord2, "errorFamily") || null;
    error.retryNotBefore = textParam(payload, "retryNotBefore") || textParam(resultRecord2, "retryNotBefore") || null;
    throw error;
  }
  const result = payload.resultJson;
  const resultRecord = asRecord3(result);
  const text4 = typeof result === "string" ? result : textParam(resultRecord, "summary") || textParam(resultRecord, "message") || textParam(resultRecord, "output");
  if (!text4) throw new Error("The Agent Session completed without an assistant message.");
  return enforceUtf8Text(text4, "Agent Session output");
}
async function startNativeAgentSessionTurn(ctx, { sessionId, companyId, prompt, reason, onEvent }) {
  let resolveTerminal;
  const completion = new Promise((resolve) => {
    resolveTerminal = resolve;
  });
  const response = await ctx.agents.sessions.sendMessage(sessionId, companyId, {
    prompt,
    reason,
    onEvent(event) {
      try {
        onEvent?.(event);
      } catch (error) {
        ctx.logger?.warn?.("Room Agent Session progress event could not be rendered.", {
          sessionId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      if (event.eventType === "done" || event.eventType === "error") resolveTerminal(event);
    }
  });
  return { runId: response.runId, completion };
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var DURABLE_JSON_PREFIX = "paperclip-room-json:v1:";
function parseState(body) {
  if (!body || typeof body !== "string") return null;
  const trimmed = body.trim();
  if (trimmed.startsWith(DURABLE_JSON_PREFIX)) {
    const encoded = trimmed.slice(DURABLE_JSON_PREFIX.length).trim();
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
    try {
      return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const match = body.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}
function serializeState(state) {
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64");
  return `${DURABLE_JSON_PREFIX}${encoded}
`;
}
function newRoomState(issue, agent, legacyWorkingDirectory = "") {
  return {
    version: 3,
    kind: "agent_room",
    roomIssueId: issue.id,
    projectId: issue.projectId ?? null,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role ?? null,
    workspace: null,
    ...legacyWorkingDirectory ? { workingDirectory: legacyWorkingDirectory } : {},
    runtime: {
      kind: "paperclip_agent_session",
      agentSessionId: null,
      lastRunId: null,
      lastError: null,
      codexThreadId: null,
      model: null,
      updatedAt: null,
      activity: { status: "idle", kind: null, turnId: null, startedAt: null, updatedAt: null, steps: [], error: null }
    },
    checkpoint: {
      version: 0,
      summary: null,
      sourceCommentId: null,
      createdAt: null,
      compactedAt: null
    },
    pendingTurn: null
  };
}
function roomWorkText(value, limit = 1200) {
  const text4 = value === void 0 || value === null ? "" : String(value).trim();
  return text4 ? text4.slice(0, limit) : null;
}
function roomWorkReferences(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => roomWorkText(entry, 1e3)).filter(Boolean))].slice(0, 24);
}
function normalizeRoomWorkOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outcome = {
    taskId: roomWorkText(value.taskId, 200),
    identifier: roomWorkText(value.identifier, 200),
    status: roomWorkText(value.status, 80),
    summary: roomWorkText(value.summary, 1600),
    sourceReferences: roomWorkReferences(value.sourceReferences)
  };
  return outcome.taskId || outcome.identifier || outcome.summary ? outcome : null;
}
function normalizeRoomNextCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = {
    summary: roomWorkText(value.summary, 1600),
    kind: roomWorkText(value.kind, 120),
    sourceReferences: roomWorkReferences(value.sourceReferences)
  };
  return candidate.summary ? candidate : null;
}
function normalizeRoomWaitingFor(value) {
  const source = asRecord3(value);
  const requestedKind = roomWorkText(source.kind, 80) || "none";
  const kind = ROOM_WAITING_KINDS.has(requestedKind) ? requestedKind : "none";
  return {
    kind,
    detail: kind === "none" ? null : roomWorkText(source.detail, 1200),
    taskId: kind === "none" ? null : roomWorkText(source.taskId, 200)
  };
}
function newRoomWorkState(issue) {
  return {
    version: 1,
    revision: 0,
    kind: "room_work_state",
    roomIssueId: issue.id,
    projectId: issue.projectId ?? null,
    objective: null,
    phase: null,
    latestOutcome: null,
    planReferences: [],
    nextCandidate: null,
    waitingFor: { kind: "none", detail: null, taskId: null },
    updatedAt: null,
    updatedBy: null
  };
}
function normalizeRoomWorkState(value, issue) {
  const base = newRoomWorkState(issue);
  const source = asRecord3(value);
  if (source.kind !== "room_work_state" || source.roomIssueId !== issue.id) return base;
  return {
    ...base,
    version: 1,
    revision: Math.max(0, Number(source.revision) || 0),
    objective: roomWorkText(source.objective, 1600),
    phase: roomWorkText(source.phase, 300),
    latestOutcome: normalizeRoomWorkOutcome(source.latestOutcome),
    planReferences: roomWorkReferences(source.planReferences),
    nextCandidate: normalizeRoomNextCandidate(source.nextCandidate),
    waitingFor: normalizeRoomWaitingFor(source.waitingFor),
    updatedAt: roomWorkText(source.updatedAt, 100),
    updatedBy: Object.keys(asRecord3(source.updatedBy)).length ? {
      kind: roomWorkText(source.updatedBy.kind, 80),
      agentId: roomWorkText(source.updatedBy.agentId, 200),
      agentName: roomWorkText(source.updatedBy.agentName, 300)
    } : null
  };
}
function mergeRoomWorkState(current, patch, issue, updatedBy = {}) {
  const source = asRecord3(patch);
  const next = normalizeRoomWorkState(current, issue);
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
  if (has("objective")) next.objective = roomWorkText(source.objective, 1600);
  if (has("phase")) next.phase = roomWorkText(source.phase, 300);
  if (has("latestOutcome")) next.latestOutcome = normalizeRoomWorkOutcome(source.latestOutcome);
  if (has("planReferences")) next.planReferences = roomWorkReferences(source.planReferences);
  if (has("nextCandidate")) next.nextCandidate = normalizeRoomNextCandidate(source.nextCandidate);
  if (has("waitingFor")) next.waitingFor = normalizeRoomWaitingFor(source.waitingFor);
  next.revision += 1;
  next.updatedAt = now();
  next.updatedBy = {
    kind: roomWorkText(updatedBy.kind, 80) || "agent",
    agentId: roomWorkText(updatedBy.agentId, 200),
    agentName: roomWorkText(updatedBy.agentName, 300)
  };
  return next;
}
function taskReviewMode(taskState) {
  return textParam(asRecord3(taskState?.review), "mode") === "manual" ? "manual" : "automatic";
}
function newTaskRoomState(issue, roomContext, input) {
  const waitingForWorker = input.workerStatusAtCreation === "paused";
  const reviewMode = input.reviewMode === "manual" ? "manual" : "automatic";
  return {
    version: 1,
    kind: "task_room",
    taskIssueId: issue.id,
    projectId: issue.projectId ?? roomContext.projectId ?? null,
    originatingRoomIssueId: roomContext.issueId,
    owningAgentId: roomContext.agentId,
    owningAgentName: roomContext.agentName,
    owningAgentRole: roomContext.agentRole,
    workerAgentId: input.assigneeAgentId,
    taskType: input.taskType,
    maturity: input.maturity,
    projectWorkspaceId: input.projectWorkspaceId ?? null,
    projectWorkspaceName: input.projectWorkspaceName ?? null,
    declaredAffectedPaths: input.affectedPaths,
    designReferences: input.designReferences,
    acceptanceCriteria: input.acceptanceCriteria,
    verification: input.verification,
    dependencyTaskIds: input.blockedByIssueIds,
    dispatch: {
      status: waitingForWorker ? "waiting_for_worker" : "ready",
      reason: waitingForWorker ? "worker_paused_before_start" : null,
      workerStatusAtCreation: input.workerStatusAtCreation ?? null,
      startedAt: waitingForWorker ? null : now(),
      updatedAt: now()
    },
    review: {
      required: "owning_agent",
      mode: reviewMode,
      status: "not_requested",
      workerReportCommentId: null,
      updatedAt: now()
    }
  };
}
function taskProtocolComment(roomContext, issue, taskState) {
  const reviewMode = taskReviewMode(taskState);
  const lines = [
    "## Task Room Protocol",
    `- Owner Agent: ${roomContext.agentName}`,
    `- Worker: ${taskState.workerAgentId}`,
    `- Task type: ${taskState.taskType}`,
    `- Maturity: ${taskState.maturity}`,
    `- Project Workspace: ${taskState.projectWorkspaceName || taskState.projectWorkspaceId || "Not bound"}`,
    reviewMode === "manual" ? "- Completion boundary: a Worker final report moves this Task to in_review and leaves a durable report in the originating Task Owner Room. The next Task Owner turn is started manually; only that Owner can technically verify and mark the Task done. This is not user or product approval." : "- Completion boundary: a Worker final report moves this Task to in_review and automatically wakes the originating Task Owner Room. Only that Owner technically verifies and marks the Task done. This is not user or product approval.",
    "- Blocker boundary: quota, permissions, missing design, or unavailable required tools must be reported before marking blocked.",
    "- Final-report gate: post one substantive Worker report before the status change. A title-only report never wakes the owner Room.",
    "- Use `## SPS Final Report` for completion or `## SPS Blocker Report` for a blocker, including outputs or blocker, evidence, risks, and next reviewer.",
    "- Do not search for SPS credentials or retry a submitted final report. Use only the provided Task capability and submit each final report once.",
    "",
    "Affected Paths (relative to the selected Project Workspace):",
    ...taskState.declaredAffectedPaths.length ? taskState.declaredAffectedPaths.map((path3) => `- ${displayTaskPath(path3)}`) : ["- Not declared"],
    "",
    "Design References:",
    ...taskState.designReferences.length ? taskState.designReferences.map((reference) => `- ${reference}`) : ["- Not required for this task type"],
    "",
    "Acceptance Criteria:",
    ...taskState.acceptanceCriteria.length ? taskState.acceptanceCriteria.map((criterion) => `- ${criterion}`) : ["- Not declared"],
    "",
    "Verification:",
    ...taskState.verification.length ? taskState.verification.map((step) => `- ${step}`) : ["- Not declared"]
  ];
  return lines.join("\n").slice(0, 3900);
}
function taskDescription(input) {
  return [
    input.description,
    "",
    `Task Type: ${input.taskType}`,
    `Maturity: ${input.maturity}`,
    `Project Workspace: ${input.projectWorkspaceName || input.projectWorkspaceId || "Not bound"}`,
    "",
    "Affected Paths (relative to the selected Project Workspace):",
    ...input.affectedPaths.length ? input.affectedPaths.map((path3) => `- ${displayTaskPath(path3)}`) : ["- Not declared"],
    "",
    "Design References:",
    ...input.designReferences.length ? input.designReferences.map((reference) => `- ${reference}`) : ["- Not required"],
    "",
    "Acceptance Criteria:",
    ...input.acceptanceCriteria.length ? input.acceptanceCriteria.map((criterion) => `- ${criterion}`) : ["- Not declared"],
    "",
    "Verification:",
    ...input.verification.length ? input.verification.map((step) => `- ${step}`) : ["- Not declared"]
  ].join("\n");
}
function agentInstructions(state, agent, agentAgentsMd) {
  const workplane = resolveAgentWorkplaneIdentity(agent);
  return [
    `You are ${agent.name}, a ${agent.role || "general"} Agent, in your long-lived SPS project Room.`,
    "Treat SPS comments as the visible conversation record and issue documents as durable Room state.",
    `Organization Workplane policy: type=${workplane.kind}; role=${workplane.roleId}; SPS memory=${workplane.memoryAccess}; Worker-result review for Tasks you own=${workplane.reviewMode}. Lead task creation and assignment are capability-gated by this policy, not by reportsTo.`,
    "The following is your managed SPS Agent AGENTS.md. It is edited from this Agent's Instructions and applies whenever this Agent works:",
    "--- AGENTS.md ---",
    agentAgentsMd,
    "--- END AGENTS.md ---",
    "Use the provided SPS tools for SPS operations. Their responses are the authority for current runtime state.",
    "The current explicit user request, current Room or Task state, and approved repository artifacts override stale recovered context.",
    "A ROOM CONTEXT RECOVERY block is prior conversation context, not a new user request or an approval.",
    roomWorkplaneBoundary(agent)
  ].join("\n");
}
function roomTools() {
  return [{
    type: "namespace",
    name: "paperclip",
    description: "Read project work and manage finite Worker Tasks within the configured Lead policy.",
    tools: [
      {
        type: "function",
        name: "memory_search",
        description: "Search approved company, current-project, or current-role memory before planning. Do not treat candidates or chat history as approved memory.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            scopes: { type: "array", items: { type: "string", enum: ["company", "project", "agent"] } },
            limit: { type: "number" }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "memory_propose",
        description: "Propose a concise memory candidate for later review. This never changes an approved learning journal.",
        inputSchema: {
          type: "object",
          required: ["content"],
          properties: {
            content: { type: "string" },
            scope: { type: "string", enum: ["company", "project", "agent", "task", "artifact", "user"] },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "update_room_work_state",
        description: "Update this Room's durable operational bookmark when its objective, phase, source pointers, latest outcome, next candidate, or waiting boundary changes. This does not create or approve a Task and must not copy project documents into SPS.",
        inputSchema: {
          type: "object",
          minProperties: 1,
          properties: {
            objective: { anyOf: [{ type: "string" }, { type: "null" }] },
            phase: { anyOf: [{ type: "string" }, { type: "null" }] },
            latestOutcome: {
              anyOf: [{
                type: "object",
                properties: {
                  taskId: { type: "string" },
                  identifier: { type: "string" },
                  status: { type: "string" },
                  summary: { type: "string" },
                  sourceReferences: { type: "array", items: { type: "string" } }
                },
                additionalProperties: false
              }, { type: "null" }]
            },
            planReferences: { type: "array", items: { type: "string" } },
            nextCandidate: {
              anyOf: [{
                type: "object",
                required: ["summary"],
                properties: {
                  summary: { type: "string" },
                  kind: { type: "string" },
                  sourceReferences: { type: "array", items: { type: "string" } }
                },
                additionalProperties: false
              }, { type: "null" }]
            },
            waitingFor: {
              type: "object",
              required: ["kind"],
              properties: {
                kind: { type: "string", enum: ["none", "user", "worker", "environment", "task_review"] },
                detail: { anyOf: [{ type: "string" }, { type: "null" }] },
                taskId: { anyOf: [{ type: "string" }, { type: "null" }] }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "list_active_tasks",
        description: "List active project Tasks and their declared affected paths before planning work.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        type: "function",
        name: "list_workers",
        description: "List organization workers that can receive a SPS Task assignment.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        type: "function",
        name: "preview_task",
        description: "Preview a finite child Task against active project Tasks before creating it. Use this before every implementation or asset Task.",
        inputSchema: {
          type: "object",
          required: ["affectedPaths"],
          properties: {
            affectedPaths: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "create_task",
        description: "Create one finite child Task owned by this Agent Room and assign a shared Worker. A paused Worker still receives one blocked Task; do not substitute or duplicate it. Use after a collision preview when finite delegated work is needed to advance the current Room objective. Design approval is not mandatory, but maturity must be explicit. Affected paths are always relative to the selected Project Workspace, never to the Project root; for example use `src/app.ts`, not `implementation/src/app.ts` when the selected Workspace is the implementation repository.",
        inputSchema: {
          type: "object",
          required: ["title", "description", "assigneeAgentId", "maturity"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            assigneeAgentId: { type: "string" },
            maturity: { type: "string", enum: ["exploration", "prototype", "committed implementation"] },
            taskType: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,63}$", description: "Optional Project task-type key. Use a configured Workspace Profile key when one exists; otherwise use a concise lowercase key such as implementation, research, release, or api-contract." },
            projectWorkspaceId: { type: "string" },
            affectedPaths: { type: "array", description: "Relative to the selected Project Workspace only. Do not prefix the Workspace folder name.", items: { type: "string" } },
            designReferences: { type: "array", items: { type: "string" } },
            acceptanceCriteria: { type: "array", items: { type: "string" } },
            verification: { type: "array", items: { type: "string" } },
            blockedByIssueIds: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "get_task_context",
        description: "Read a project Task Room's state and recent visible feedback before giving owner-Agent guidance.",
        inputSchema: {
          type: "object",
          required: ["taskId"],
          properties: { taskId: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "start_task",
        description: "Start the same blocked Task after its originally assigned Worker becomes available. This never resumes the Worker, changes assignee, or creates a replacement Task.",
        inputSchema: {
          type: "object",
          required: ["taskId"],
          properties: { taskId: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "post_task_feedback",
        description: "Post feedback into a Task owned by this Agent Room and return it to the assigned Worker for correction or more evidence. This can also reopen a technically completed Task after later user or design review.",
        inputSchema: {
          type: "object",
          required: ["taskId", "message"],
          properties: { taskId: { type: "string" }, message: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "complete_task",
        description: "Mark an in_review Task owned by this Agent Room done after its Worker evidence satisfies every acceptance criterion. This records Task Owner technical verification, not user or product approval. Workers can never call this.",
        inputSchema: {
          type: "object",
          required: ["taskId", "reviewSummary"],
          properties: {
            taskId: { type: "string" },
            reviewSummary: { type: "string" }
          },
          additionalProperties: false
        }
      }
    ]
  }];
}
async function requireRoom(ctx, companyId, issueId) {
  let issue = await ctx.issues.get(issueId, companyId);
  if (!issue) throw new Error("Room issue was not found.");
  if (isAgentRoom(issue) && issue.status === "backlog") {
    issue = await ctx.issues.update(issue.id, { status: ROOM_READY_STATUS }, companyId);
  }
  const agentId = agentRoomAgentId(issue);
  if (!agentId) throw new Error("Room Chat is available only on a provisioned Agent Room.");
  if (issue.assigneeAgentId) throw new Error("A long-lived Agent Room must remain unassigned.");
  if (issue.parentId) throw new Error("A long-lived Agent Room must be a root project issue.");
  if (TERMINAL_STATUSES.has(issue.status)) throw new Error("Closed Agent Rooms cannot receive chat messages.");
  const agent = await ctx.agents.get(agentId, companyId);
  if (!agent) throw new Error("The Agent linked to this Room was not found.");
  return { issue, agent };
}
async function loadRoomState(ctx, companyId, issue, agent) {
  const document = await ctx.issues.documents.get(issue.id, ROOM_STATE_KEY, companyId);
  const parsed = parseState(document?.body);
  if (parsed && parsed.roomIssueId === issue.id) {
    if (parsed.agentId && parsed.agentId !== agent.id) throw new Error("Room state Agent does not match the linked Agent Room.");
    const upgraded = {
      ...parsed,
      version: Math.max(Number(parsed.version) || 0, 3),
      kind: "agent_room",
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role ?? null
    };
    const bound2 = await ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, upgraded);
    const identityChanged = parsed.agentId !== agent.id || parsed.agentName !== agent.name || parsed.agentRole !== (agent.role ?? null);
    if (identityChanged || bound2.changed) {
      await saveRoomState(ctx, companyId, issue.id, upgraded, "Upgrade Room identity and Workspace binding");
    }
    return upgraded;
  }
  const state = newRoomState(issue, agent, ctx.projects?.listWorkspaces ? "" : agentWorkingDirectory(agent));
  const bound = await ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, state);
  await saveRoomState(ctx, companyId, issue.id, state, "Initialize Room state");
  await upsertRoomDocument(ctx, {
    issueId: issue.id,
    key: ROOM_CHECKPOINTS_KEY,
    body: "[]\n",
    companyId,
    title: "Room checkpoints",
    format: "markdown",
    changeSummary: "Initialize checkpoint history"
  });
  return bound.state;
}
async function saveRoomState(ctx, companyId, issueId, state, changeSummary) {
  return queueRoomDocumentWrite(issueId, ROOM_STATE_KEY, async () => {
    await putRoomDocumentFromInvocation(ctx, {
      issueId,
      key: ROOM_STATE_KEY,
      body: serializeState(state),
      companyId,
      title: "Room state",
      format: "markdown",
      changeSummary
    });
  });
}
async function loadRoomWorkState(ctx, companyId, issue) {
  const document = await ctx.issues.documents.get(issue.id, ROOM_WORK_STATE_KEY, companyId);
  return normalizeRoomWorkState(parseState(document?.body), issue);
}
async function saveRoomWorkState(ctx, companyId, issue, state, changeSummary) {
  const normalized = normalizeRoomWorkState(state, issue);
  return queueRoomDocumentWrite(issue.id, ROOM_WORK_STATE_KEY, async () => {
    await putRoomDocumentFromInvocation(ctx, {
      issueId: issue.id,
      key: ROOM_WORK_STATE_KEY,
      body: serializeState(normalized),
      companyId,
      title: "Room work state",
      format: "markdown",
      changeSummary
    });
    return normalized;
  });
}
async function updateRoomWorkState(ctx, companyId, issue, patch, changeSummary, updatedBy = {}) {
  return queueRoomDocumentWrite(issue.id, ROOM_WORK_STATE_KEY, async () => {
    return retryRoomDocumentWrite(async () => {
      const document = await ctx.issues.documents.get(issue.id, ROOM_WORK_STATE_KEY, companyId);
      const current = normalizeRoomWorkState(parseState(document?.body), issue);
      const next = mergeRoomWorkState(current, patch, issue, updatedBy);
      const runtime = await getRuntimeConfig(ctx);
      await putRoomDocument(runtime.spsApiUrl, {
        issueId: issue.id,
        key: ROOM_WORK_STATE_KEY,
        body: serializeState(next),
        title: "Room work state",
        format: "markdown",
        baseRevisionId: document?.latestRevisionId ?? null,
        changeSummary
      });
      return next;
    });
  });
}
async function upsertRoomDocument(ctx, input) {
  return queueRoomDocumentWrite(input.issueId, input.key, () => putRoomDocumentFromInvocation(ctx, input));
}
async function putRoomDocumentFromInvocation(ctx, input) {
  return retryRoomDocumentWrite(async () => {
    const existing = await ctx.issues.documents.get(input.issueId, input.key, input.companyId);
    const runtime = await getRuntimeConfig(ctx);
    return putRoomDocument(runtime.spsApiUrl, {
      ...input,
      baseRevisionId: existing?.latestRevisionId ?? null
    });
  });
}
function loopbackSPSApiUrl(value) {
  const parsed = new URL(value || "http://127.0.0.1:3100");
  const localHosts = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!localHosts.has(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Room document writes require a loopback SPS API URL.");
  }
  return parsed.toString().replace(/\/$/, "");
}
async function paperclipJsonDirect(apiUrl, apiPath, { method = "GET", body, operation = "request" } = {}) {
  if (!String(apiPath || "").startsWith("/api/")) {
    throw new Error("SPS direct requests must use an /api/ path.");
  }
  const response = await fetch(`${loopbackSPSApiUrl(apiUrl)}${apiPath}`, {
    method,
    ...body === void 0 ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  });
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }
  if (!response.ok) {
    const detail = typeof result === "string" ? result : textParam(asRecord3(result), "error") || responseText;
    const error = new Error(`SPS ${operation} failed (HTTP ${response.status})${detail ? `: ${String(detail).slice(0, 400)}` : "."}`);
    error.status = response.status;
    throw error;
  }
  return result;
}
function directArrayPayload(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(asRecord3(value)[key])) return asRecord3(value)[key];
  }
  return [];
}
async function listCompaniesDirect(apiUrl) {
  const result = await paperclipJsonDirect(apiUrl, "/api/companies", { operation: "Company list" });
  return directArrayPayload(result, ["companies", "items", "data"]);
}
async function listTaskOwnerBoundaryIssues(ctx, companyId) {
  const issues = [];
  for (const status of TASK_OWNER_REPORT_STATUSES) {
    let offset = 0;
    while (true) {
      const batch = await ctx.issues.list({
        companyId,
        status,
        includePluginOperations: true,
        limit: 500,
        offset
      });
      issues.push(...batch);
      if (batch.length < 500) break;
      offset += batch.length;
    }
  }
  return issues;
}
async function listCompanyAgentsDirect(apiUrl, companyId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/companies/${encodeURIComponent(companyId)}/agents`,
    { operation: "Agent list" }
  );
  return directArrayPayload(result, ["agents", "items", "data"]);
}
async function listCompanyIssuesDirect(apiUrl, companyId, projectId = "") {
  const query = new URLSearchParams({ limit: "500" });
  if (projectId) query.set("projectId", projectId);
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/companies/${encodeURIComponent(companyId)}/issues?${query.toString()}`,
    { operation: "Task list" }
  );
  const issues = directArrayPayload(result, ["issues", "items", "data"]);
  return projectId ? issues.filter((issue) => issue.projectId === projectId) : issues;
}
async function listProjectWorkspacesDirect(apiUrl, projectId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/projects/${encodeURIComponent(projectId)}/workspaces`,
    { operation: "Project Workspace list" }
  );
  return directArrayPayload(result, ["workspaces", "items", "data"]);
}
async function getIssueDirect(apiUrl, issueId) {
  return paperclipJsonDirect(apiUrl, `/api/issues/${encodeURIComponent(issueId)}`, { operation: "Task read" });
}
async function createIssueDirect(apiUrl, companyId, input) {
  return paperclipJsonDirect(
    apiUrl,
    `/api/companies/${encodeURIComponent(companyId)}/issues`,
    { method: "POST", body: input, operation: "Task creation" }
  );
}
async function updateIssueDirect(apiUrl, issueId, input) {
  return paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}`,
    { method: "PATCH", body: input, operation: "Task update" }
  );
}
async function listIssueCommentsDirect(apiUrl, issueId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}/comments`,
    { operation: "Task comment list" }
  );
  return directArrayPayload(result, ["comments", "items", "data"]);
}
async function listIssueRunsDirect(apiUrl, issueId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}/runs`,
    { operation: "Task run list" }
  );
  return directArrayPayload(result, ["runs", "items", "data"]);
}
async function createIssueCommentDirect(apiUrl, issueId, body) {
  return paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}/comments`,
    { method: "POST", body: { body }, operation: "Task comment creation" }
  );
}
async function upsertRoomDocumentOutsideInvocation(apiUrl, input) {
  return queueRoomDocumentWrite(input.issueId, input.key, () => retryRoomDocumentWrite(async () => {
    const existing = await getRoomDocumentDirect(apiUrl, input.issueId, input.key);
    return putRoomDocument(apiUrl, {
      ...input,
      baseRevisionId: existing?.latestRevisionId ?? null
    });
  }));
}
async function updateAgentAdapterConfigDirect(apiUrl, companyId, agentId, adapterConfig) {
  const query = new URLSearchParams({ companyId: String(companyId || "") });
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/agents/${encodeURIComponent(agentId)}?${query.toString()}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adapterConfig, replaceAdapterConfig: true })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`SPS could not update the Agent configuration (HTTP ${response.status}): ${body || "unknown error"}`);
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}
function attachmentIdsParam(params) {
  return [...new Set(listParam(params, "attachmentIds"))];
}
function repairUtf8Mojibake(value) {
  const source = String(value ?? "");
  const mojibake = /(?:Ã.|Â.|â..|ð...|ì[\u0080-\u00bf]|í[\u0080-\u00bf]|ë[\u0080-\u00bf]|ê[\u0080-\u00bf])/;
  if (!source || /[^\u0000-\u00ff]/.test(source) || !mojibake.test(source)) return source;
  let repaired = source;
  for (let attempt = 0; attempt < 2 && mojibake.test(repaired); attempt += 1) {
    try {
      const candidate = Buffer.from(repaired, "latin1").toString("utf8");
      if (!candidate || candidate.includes("\uFFFD") || candidate === repaired) break;
      repaired = candidate;
    } catch {
      break;
    }
  }
  return repaired;
}
function enforceUtf8Text(value, label = "Text") {
  const text4 = repairUtf8Mojibake(value).replace(/\r\n/g, "\n");
  if (text4.includes("\uFFFD")) {
    throw new Error(`${label} contains an invalid UTF-8 replacement character and was not saved to avoid corrupted text.`);
  }
  return text4;
}
function enforceTaskContractText(value, label = "Task text") {
  const text4 = enforceUtf8Text(value, label);
  if (/\?{2,}/.test(text4)) {
    throw new Error(`${label} contains a likely lossy encoding sequence (??) and was not saved.`);
  }
  return text4;
}
function roomAttachmentName(attachment) {
  const filename = textParam(attachment, "originalFilename") || textParam(attachment, "filename");
  return repairUtf8Mojibake(filename) || `attachment-${textParam(attachment, "id", "file")}`;
}
function safeAttachmentFilename(filename) {
  const basename = path2.basename(String(filename || "attachment"));
  const cleaned = basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 120);
  return cleaned || "attachment";
}
function safeAttachmentPathSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "unknown";
}
function attachmentContentPath2(attachment) {
  const contentPath = textParam(attachment, "contentPath");
  return contentPath || `/api/attachments/${encodeURIComponent(textParam(attachment, "id"))}/content`;
}
function roomAttachmentContentUrl(apiUrl, attachment) {
  return new URL(attachmentContentPath2(attachment), `${loopbackSPSApiUrl(apiUrl)}/`).toString();
}
function isCodexImageAttachment(attachment) {
  const contentType = textParam(attachment, "contentType").toLowerCase();
  if (/^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(contentType)) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(roomAttachmentName(attachment));
}
function roomAttachmentCacheRoot() {
  const paperclipHome = String(process.env.PAPERCLIP_HOME || "").trim();
  return paperclipHome ? path2.join(paperclipHome, "room-attachments") : path2.join(os.homedir(), ".sps", "room-attachments");
}
function roomAttachmentWorkspaceRoot(workingDirectory) {
  const requestedWorkspace = String(workingDirectory || "").trim();
  if (!requestedWorkspace) {
    throw new Error("A Room Workspace is required before attached files can be prepared for an Agent.");
  }
  const workspaceRoot = path2.resolve(requestedWorkspace);
  const attachmentRoot = path2.resolve(workspaceRoot, ".sps", "room-attachments");
  const relative = path2.relative(workspaceRoot, attachmentRoot);
  if (!relative || relative === ".." || relative.startsWith(`..${path2.sep}`) || path2.isAbsolute(relative)) {
    throw new Error("The Room attachment staging path must stay inside the selected Project Workspace.");
  }
  return attachmentRoot;
}
function workspaceGitExcludePath(workingDirectory) {
  const dotGitPath = path2.join(workingDirectory, ".git");
  if (!fs2.existsSync(dotGitPath)) return null;
  const stats = fs2.statSync(dotGitPath);
  if (stats.isDirectory()) return path2.join(dotGitPath, "info", "exclude");
  if (!stats.isFile()) return null;
  const match = fs2.readFileSync(dotGitPath, "utf8").match(/^gitdir:\s*(.+)\s*$/im);
  return match ? path2.join(path2.resolve(workingDirectory, match[1]), "info", "exclude") : null;
}
function excludeWorkspaceRoomAttachments(workingDirectory) {
  const excludePath = workspaceGitExcludePath(workingDirectory);
  if (!excludePath) return null;
  const rule = ".sps/room-attachments/";
  const existing = fs2.existsSync(excludePath) ? fs2.readFileSync(excludePath, "utf8") : "";
  if (existing.split(/\r?\n/).some((line) => line.trim().replace(/\\/g, "/") === rule)) return excludePath;
  fs2.mkdirSync(path2.dirname(excludePath), { recursive: true });
  fs2.appendFileSync(excludePath, `${existing && !existing.endsWith("\n") ? "\n" : ""}${rule}
`, "utf8");
  return excludePath;
}
function cleanupRoomAttachmentCache(root = roomAttachmentCacheRoot(), nowMs = Date.now()) {
  if (!fs2.existsSync(root)) return [];
  const removed = [];
  for (const roomEntry of fs2.readdirSync(root, { withFileTypes: true })) {
    if (!roomEntry.isDirectory()) continue;
    const roomPath = path2.join(root, roomEntry.name);
    for (const attachmentEntry of fs2.readdirSync(roomPath, { withFileTypes: true })) {
      if (!attachmentEntry.isDirectory()) continue;
      const attachmentPath = path2.join(roomPath, attachmentEntry.name);
      const modifiedAt = fs2.statSync(attachmentPath).mtimeMs;
      if (nowMs - modifiedAt <= ROOM_ATTACHMENT_CACHE_RETENTION_MS) continue;
      fs2.rmSync(attachmentPath, { recursive: true, force: true });
      removed.push(attachmentPath);
    }
    if (!fs2.readdirSync(roomPath).length) fs2.rmdirSync(roomPath);
  }
  return removed;
}
function attachmentSnapshot(attachment) {
  return {
    id: textParam(attachment, "id"),
    originalFilename: roomAttachmentName(attachment),
    contentType: textParam(attachment, "contentType") || "application/octet-stream",
    byteSize: Number(attachment?.byteSize) || 0,
    contentPath: attachmentContentPath2(attachment),
    openPath: textParam(attachment, "openPath") || null,
    downloadPath: textParam(attachment, "downloadPath") || null
  };
}
async function listIssueAttachmentsDirect(apiUrl, issueId) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/attachments`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`SPS attachment list failed (HTTP ${response.status}).`);
  const result = await response.json();
  return Array.isArray(result) ? result : Array.isArray(result?.attachments) ? result.attachments : [];
}
async function resolveRoomAttachments(apiUrl, issueId, attachmentIds) {
  if (!attachmentIds.length) return [];
  const available = await listIssueAttachmentsDirect(apiUrl, issueId);
  const byId = new Map(available.map((attachment) => [textParam(attachment, "id"), attachment]));
  const missing = attachmentIds.filter((id) => !byId.has(id));
  if (missing.length) throw new Error("One or more selected files are no longer attached to this Room.");
  return attachmentIds.map((id) => attachmentSnapshot(byId.get(id)));
}
function mergeRoomAttachments(...groups) {
  const byId = /* @__PURE__ */ new Map();
  for (const group of groups) {
    for (const attachment of Array.isArray(group) ? group : []) {
      const snapshot = attachmentSnapshot(attachment);
      if (!snapshot.id || byId.has(snapshot.id)) continue;
      byId.set(snapshot.id, snapshot);
    }
  }
  return [...byId.values()];
}
async function stageRoomAttachments(apiUrl, roomIssueId, attachments, workingDirectory) {
  const workspaceRoot = path2.resolve(String(workingDirectory || "").trim());
  const cacheRoot = roomAttachmentWorkspaceRoot(workspaceRoot);
  excludeWorkspaceRoomAttachments(workspaceRoot);
  cleanupRoomAttachmentCache(cacheRoot);
  const roomDirectory = path2.join(cacheRoot, safeAttachmentPathSegment(roomIssueId));
  const staged = [];
  for (const attachment of attachments) {
    const attachmentId = textParam(attachment, "id");
    if (!attachmentId) throw new Error("An attached file did not have a SPS attachment id.");
    const directory = path2.join(roomDirectory, safeAttachmentPathSegment(attachmentId));
    const localPath = path2.join(directory, safeAttachmentFilename(roomAttachmentName(attachment)));
    const partialPath = `${localPath}.partial`;
    const response = await fetch(roomAttachmentContentUrl(apiUrl, attachment));
    if (!response.ok) throw new Error(`Could not read attached file ${roomAttachmentName(attachment)} (HTTP ${response.status}).`);
    fs2.mkdirSync(directory, { recursive: true });
    fs2.writeFileSync(partialPath, Buffer.from(await response.arrayBuffer()));
    fs2.rmSync(localPath, { force: true });
    fs2.renameSync(partialPath, localPath);
    fs2.utimesSync(directory, /* @__PURE__ */ new Date(), /* @__PURE__ */ new Date());
    staged.push({ ...attachment, localPath, isImage: isCodexImageAttachment(attachment) });
  }
  return staged;
}
function roomAttachmentCommentBlock(attachments) {
  if (!attachments.length) return "";
  const rows = attachments.map((attachment) => {
    const label = roomAttachmentName(attachment).replace(/([\[\]])/g, "\\$1");
    return `- [${label}](${attachmentContentPath2(attachment)})`;
  });
  return `

**Attached files**
${rows.join("\n")}
<!-- paperclip-room-attachments:${attachments.map((attachment) => attachment.id).join(",")} -->`;
}
function roomUserCommentBody(message, attachments, mode = "agent", retryOfCommentId = "") {
  const text4 = enforceUtf8Text(message, "Room message").trim() || "Please inspect the attached files.";
  const retryMarker = retryOfCommentId ? `
<!-- paperclip-room-retry-of:${retryOfCommentId} -->` : "";
  return `**User**
${text4}${retryMarker}${roomAttachmentCommentBlock(attachments)}`;
}
var ROOM_RESPONSE_CONTRACT = [
  "SYSTEM-PROVIDED ROOM RESPONSE CONTRACT:",
  "- When the current request asks to show or preview an existing Workspace image, the final response must embed at least one relevant image with Markdown image syntax and a verified absolute local path.",
  "- On Windows, use this form: `![description](<C:/absolute/path/to/image.png>)`. The Room UI converts verified Workspace paths into safe inline previews and clickable file links.",
  "- Do not merely say that an image is shown. If no relevant image exists or its path cannot be verified, say that clearly instead of emitting a broken or invented path.",
  "- Use ordinary Markdown links with verified absolute local paths for other Workspace files that the user should inspect."
].join("\n");
function roomTurnText(message, stagedAttachments, retryOfCommentId = "") {
  const text4 = enforceUtf8Text(message, "Room message").trim() || "Please inspect the attached files and respond to the user.";
  const retryPreamble = retryOfCommentId ? `USER MESSAGE REVISION: This message replaces the earlier user message ${retryOfCommentId}. Treat this revision as the current request. Do not continue or answer the superseded version.

` : "";
  if (!stagedAttachments.length) return `${retryPreamble}${text4}

${ROOM_RESPONSE_CONTRACT}`;
  const fileContext = stagedAttachments.map((attachment) => {
    const delivery = attachment.isImage ? "also supplied as an image input" : "available as a local file";
    return `- ${roomAttachmentName(attachment)} (${attachment.contentType}, ${attachment.byteSize} bytes): ${attachment.localPath} (${delivery})`;
  });
  return `${retryPreamble}${text4}

Attached Room files are durable SPS attachments. Inspect only the files relevant to the request and do not execute untrusted binaries.
${fileContext.join("\n")}

${ROOM_RESPONSE_CONTRACT}`;
}
function isRoomUserComment(comment) {
  return /^\*\*User\*\*/i.test(String(comment?.body || "").trim());
}
async function validateRoomRetrySource(ctx, companyId, issueId, retryOfCommentId) {
  const sourceCommentId = String(retryOfCommentId || "").trim();
  if (!sourceCommentId) return "";
  if (!ctx.issues.listComments) throw new Error("Room message retry is unavailable because Room comments could not be read.");
  const comments = await ctx.issues.listComments(issueId, companyId);
  const sourceComment = comments.find((comment) => comment.id === sourceCommentId);
  if (!sourceComment || !isRoomUserComment(sourceComment)) {
    throw new Error("The selected message is not a user message in this Room.");
  }
  return sourceCommentId;
}
async function putRoomDocument(apiUrl, input) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(input.issueId)}/documents/${encodeURIComponent(input.key)}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      // SPS's public document API stores durable bodies as Markdown.
      // JSON Room state remains valid content inside a Markdown document.
      format: "markdown",
      body: input.body,
      baseRevisionId: input.baseRevisionId,
      changeSummary: input.changeSummary
    })
  });
  if (!response.ok) {
    const error = new Error(`SPS Room document write failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
function isRevisionConflict(error) {
  return error?.status === 409 || error?.status === 500;
}
async function retryRoomDocumentWrite(work) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isRevisionConflict(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
  throw new Error("Room document write retry unexpectedly exhausted.");
}
async function getRoomDocumentDirect(apiUrl, issueId, key) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`;
  const response = await fetch(endpoint);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Room document read failed (${response.status}).`);
  return response.json();
}
async function saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary) {
  return queueRoomDocumentWrite(issueId, ROOM_STATE_KEY, async () => {
    return retryRoomDocumentWrite(async () => {
      const existing = await getRoomDocumentDirect(apiUrl, issueId, ROOM_STATE_KEY);
      return putRoomDocument(apiUrl, {
        issueId,
        key: ROOM_STATE_KEY,
        body: serializeState(state),
        title: "Room state",
        format: "markdown",
        baseRevisionId: existing?.latestRevisionId ?? null,
        changeSummary
      });
    });
  });
}
function roomWorkIssue(roomContext) {
  return { id: roomContext.issueId, projectId: roomContext.projectId ?? null };
}
async function updateRoomWorkStateOutsideInvocation(roomContext, patch, changeSummary, updatedBy = {}) {
  return queueRoomDocumentWrite(roomContext.issueId, ROOM_WORK_STATE_KEY, async () => {
    return retryRoomDocumentWrite(async () => {
      const document = await getRoomDocumentDirect(roomContext.spsApiUrl, roomContext.issueId, ROOM_WORK_STATE_KEY);
      const issue = roomWorkIssue(roomContext);
      const current = normalizeRoomWorkState(parseState(document?.body), issue);
      const next = mergeRoomWorkState(current, patch, issue, updatedBy);
      await putRoomDocument(roomContext.spsApiUrl, {
        issueId: roomContext.issueId,
        key: ROOM_WORK_STATE_KEY,
        body: serializeState(next),
        title: "Room work state",
        format: "markdown",
        baseRevisionId: document?.latestRevisionId ?? null,
        changeSummary
      });
      return next;
    });
  });
}
async function appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint) {
  const document = await getRoomDocumentDirect(apiUrl, issueId, ROOM_CHECKPOINTS_KEY);
  let checkpoints = parseState(document?.body);
  if (!Array.isArray(checkpoints)) checkpoints = [];
  checkpoints.push(checkpoint);
  return putRoomDocument(apiUrl, {
    issueId,
    key: ROOM_CHECKPOINTS_KEY,
    body: serializeState(checkpoints),
    title: "Room checkpoints",
    format: "markdown",
    baseRevisionId: document?.latestRevisionId ?? null,
    changeSummary: "Append Room compact checkpoint"
  });
}
function nativeCompactionEventId(message) {
  const params = asRecord3(message?.params);
  const threadId = textParam(params, "threadId");
  const turnId = textParam(params, "turnId");
  return threadId && turnId ? `${threadId}:${turnId}` : "";
}
async function appendNativeCompactionOutsideInvocation(apiUrl, issueId, event) {
  const document = await getRoomDocumentDirect(apiUrl, issueId, ROOM_NATIVE_COMPACTIONS_KEY);
  let events = parseState(document?.body);
  if (!Array.isArray(events)) events = [];
  if (events.some((entry) => entry?.id === event.id)) return events;
  events.push(event);
  await putRoomDocument(apiUrl, {
    issueId,
    key: ROOM_NATIVE_COMPACTIONS_KEY,
    body: serializeState(events.slice(-100)),
    title: "Native Codex compactions",
    format: "markdown",
    baseRevisionId: document?.latestRevisionId ?? null,
    changeSummary: "Record native Codex context compaction"
  });
  return events;
}
async function recordNativeCodexCompaction(ctx, message) {
  const itemCompaction = message?.method === "item/completed" && message?.params?.item?.type === "contextCompaction";
  const threadCompaction = message?.method === "thread/compacted";
  if (!itemCompaction && !threadCompaction) return false;
  const eventId = nativeCompactionEventId(message);
  const threadId = textParam(asRecord3(message?.params), "threadId");
  const context = activeThreadContexts.get(threadId);
  if (!eventId || !context || manualCodexCompactionThreads.has(threadId) || recordedNativeCompactionEvents.has(eventId)) return false;
  recordedNativeCompactionEvents.add(eventId);
  const run = async () => {
    try {
      await appendNativeCompactionOutsideInvocation(context.spsApiUrl, context.issueId, {
        id: eventId,
        kind: "codex_native_auto",
        threadId,
        turnId: textParam(asRecord3(message?.params), "turnId"),
        occurredAt: now(),
        note: "Codex compacted its internal context automatically. SPS conversation and checkpoints remain the durable Room record."
      });
      return true;
    } catch (error) {
      recordedNativeCompactionEvents.delete(eventId);
      ctx.logger?.warn?.("Could not record native Codex compaction.", {
        issueId: context.issueId,
        threadId,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };
  const previous = nativeCompactionLocks.get(context.issueId) ?? Promise.resolve();
  const next = previous.catch(() => {
  }).then(run);
  nativeCompactionLocks.set(context.issueId, next);
  try {
    return await next;
  } finally {
    if (nativeCompactionLocks.get(context.issueId) === next) nativeCompactionLocks.delete(context.issueId);
  }
}
async function createRoomCommentOutsideInvocation(apiUrl, issueId, body) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/comments`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });
  if (!response.ok) throw new Error(`Room comment write failed (${response.status}).`);
  return response.json();
}
async function appendCheckpoint(ctx, companyId, issueId, checkpoint) {
  const document = await ctx.issues.documents.get(issueId, ROOM_CHECKPOINTS_KEY, companyId);
  let checkpoints = parseState(document?.body);
  if (!Array.isArray(checkpoints)) checkpoints = [];
  checkpoints.push(checkpoint);
  await upsertRoomDocument(ctx, {
    issueId,
    key: ROOM_CHECKPOINTS_KEY,
    body: serializeState(checkpoints),
    companyId,
    title: "Room checkpoints",
    format: "markdown",
    changeSummary: "Append Room compact checkpoint"
  });
  await publishRoomMemoryLifecycle(ctx, companyId, issueId, "room.checkpoint", checkpoint);
}
async function publishRoomMemoryLifecycle(ctx, companyId, issueId, eventType, checkpoint) {
  if (!ctx.memory?.publishLifecycle) return;
  try {
    await ctx.memory.publishLifecycle({
      eventType,
      companyId,
      entityType: "room",
      entityId: issueId,
      roomId: issueId,
      idempotencyKey: `room:${issueId}:${eventType}:${checkpoint.version}`
    });
  } catch (error) {
    ctx.logger?.warn?.("Room memory lifecycle publication failed.", {
      issueId,
      eventType,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
function roomStreamChannel(issueId) {
  return `room:${issueId}`;
}
function emitRoomEvent(ctx, companyId, issueId, event) {
  if (!ctx.streams?.emit) return;
  const channel = roomStreamChannel(issueId);
  try {
    ctx.streams.open?.(channel, companyId);
    ctx.streams.emit(channel, { issueId, at: now(), ...event });
  } catch (error) {
    ctx.logger?.warn?.("Room stream event was not delivered.", {
      issueId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
function roomJobTitle(kind) {
  return {
    room_message: "Room message",
    compact_handoff: "Room compact",
    task_owner_feedback: "Task owner feedback",
    task_owner_report: "Task owner report"
  }[kind] ?? "Room job";
}
function roomJobData(input) {
  return {
    id: input.id,
    companyId: input.companyId,
    roomIssueId: input.roomIssueId,
    taskIssueId: input.taskIssueId ?? null,
    kind: input.kind,
    status: input.status,
    sourceCommentId: input.sourceCommentId ?? null,
    requestedAt: input.requestedAt,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    resultCommentId: input.resultCommentId ?? null,
    error: input.error ?? null,
    payload: asRecord3(input.payload)
  };
}
async function createRoomJob(ctx, input) {
  const job = roomJobData({ ...input, id: randomUUID2(), status: "queued", requestedAt: now() });
  if (ctx.entities?.upsert) {
    await ctx.entities.upsert({
      entityType: ROOM_JOB_ENTITY_TYPE,
      scopeKind: "issue",
      scopeId: job.roomIssueId,
      externalId: job.id,
      title: roomJobTitle(job.kind),
      status: job.status,
      data: job
    });
  }
  return job;
}
async function updateRoomJob(ctx, job, patch) {
  const next = roomJobData({ ...job, ...patch });
  if (ctx.entities?.upsert) {
    await ctx.entities.upsert({
      entityType: ROOM_JOB_ENTITY_TYPE,
      scopeKind: "issue",
      scopeId: next.roomIssueId,
      externalId: next.id,
      title: roomJobTitle(next.kind),
      status: next.status,
      data: next
    });
  }
  return next;
}
async function listRoomJobs(ctx, issueId) {
  if (!ctx.entities?.list) return [];
  const records = await ctx.entities.list({
    entityType: ROOM_JOB_ENTITY_TYPE,
    scopeKind: "issue",
    scopeId: issueId,
    limit: 100
  });
  return records.map((record) => roomJobData(asRecord3(record.data))).filter((job) => job.id && job.roomIssueId === issueId);
}
async function activeRoomJob(ctx, issueId) {
  const jobs = await listRoomJobs(ctx, issueId);
  return jobs.find((job) => ACTIVE_ROOM_JOB_STATUSES.has(job.status)) ?? null;
}
function isRoomProviderQuotaRetryJob(job) {
  const payload = asRecord3(job?.payload);
  return textParam(job, "status") === "queued" && textParam(payload, "retryRuntime") === "agy" && Boolean(textParam(payload, "quotaRetryAt"));
}
async function scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error }) {
  if (!AUTOMATIC_PROVIDER_QUOTA_RETRY_ENABLED) {
    const quotaError = String(error instanceof Error ? error.message : error).slice(0, 500);
    const stoppedJob = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: quotaError,
      payload: {
        ...asRecord3(job.payload),
        retryRuntime: null,
        quotaRetryAt: null,
        quotaError
      }
    });
    state.pendingTurn = null;
    state.runtime ??= {};
    state.runtime.lastError = quotaError;
    state.runtime.quotaRetry = {
      status: "disabled",
      runtime: "agy",
      automaticRetry: false,
      retryAt: null,
      updatedAt: now()
    };
    state.runtime.activity ??= { steps: [] };
    state.runtime.activity.status = "error";
    state.runtime.activity.updatedAt = now();
    state.runtime.activity.error = quotaError;
    if (Array.isArray(state.runtime.activity.steps)) {
      state.runtime.activity.steps.push({ id: `quota-block-${Date.now()}`, type: "runtime", label: "Agy quota reached; automatic retry is disabled", status: "error", updatedAt: now() });
    }
    await saveRoomStateOutsideInvocation(runtime.spsApiUrl, issue.id, state, "Record Agy quota block without automatic retry");
    emitRoomEvent(ctx, job.companyId, issue.id, { type: "quota_retry_disabled", job: stoppedJob });
    return { ok: true, retryScheduled: false, retryDisabled: true, job: stoppedJob };
  }
  const current = Date.now();
  const retryAt = providerQuotaRetryAtFromError(error, current);
  const priorAttempt = Math.max(0, Number(asRecord3(job.payload).quotaRetryAttempt) || 0);
  const payload = {
    ...asRecord3(job.payload),
    retryRuntime: "agy",
    quotaRetryAt: retryAt,
    quotaRetryAttempt: priorAttempt + 1,
    quotaError: String(error instanceof Error ? error.message : error).slice(0, 500)
  };
  const queuedJob = await updateRoomJob(ctx, job, {
    status: "queued",
    startedAt: null,
    completedAt: null,
    error: null,
    payload
  });
  state.pendingTurn = {
    ...asRecord3(state.pendingTurn),
    kind: queuedJob.kind,
    jobId: queuedJob.id,
    sourceCommentId: queuedJob.sourceCommentId ?? null,
    retryRuntime: "agy",
    retryAt,
    quotaRetryAttempt: payload.quotaRetryAttempt
  };
  state.runtime ??= {};
  state.runtime.lastError = payload.quotaError;
  state.runtime.quotaRetry = {
    status: "waiting",
    runtime: "agy",
    retryAt,
    attempt: payload.quotaRetryAttempt,
    updatedAt: now()
  };
  state.runtime.activity ??= { steps: [] };
  state.runtime.activity.status = "waiting";
  state.runtime.activity.updatedAt = now();
  state.runtime.activity.error = null;
  if (Array.isArray(state.runtime.activity.steps)) {
    state.runtime.activity.steps.push({ id: `quota-wait-${Date.now()}`, type: "runtime", label: "Agy quota reached; retrying in 30 minutes", status: "waiting", updatedAt: now() });
  }
  await saveRoomStateOutsideInvocation(runtime.spsApiUrl, issue.id, state, "Keep Room Job queued for the next Agy quota retry");
  emitRoomEvent(ctx, job.companyId, issue.id, { type: "quota_retry_scheduled", job: queuedJob, retryAt });
  return { ok: true, retryScheduled: true, retryAt, job: queuedJob };
}
async function launchDueRoomProviderQuotaRetry(ctx, job, current = Date.now()) {
  if (!isRoomProviderQuotaRetryJob(job)) return { launched: false, reason: "not_quota_retry" };
  if (job.kind === "task_owner_report" && job.taskIssueId) {
    const task = await ctx.issues.get(job.taskIssueId, job.companyId).catch(() => null);
    if (task && !TASK_OWNER_REPORT_STATUSES.has(task.status)) {
      const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, job.companyId);
      const taskState = parseState(taskStateDocument?.body);
      const ownerRoom = task.parentId ? await ctx.issues.get(task.parentId, job.companyId).catch(() => null) : null;
      if (taskState?.kind === "task_room" && ownerRoom) {
        const cancelled = await cancelResolvedTaskOwnerQuotaRetry(ctx, {
          companyId: job.companyId,
          task,
          taskState,
          ownerRoom
        });
        return { launched: false, cancelled, reason: "task_status_changed" };
      }
    }
  }
  const retryAt = new Date(textParam(asRecord3(job.payload), "quotaRetryAt") || 0).getTime();
  if (!Number.isFinite(retryAt) || retryAt > current) return { launched: false, reason: "not_due" };
  if (activeRoomMessageJobs.has(job.roomIssueId)) return { launched: false, reason: "room_busy" };
  const { issue, agent } = await requireRoom(ctx, job.companyId, job.roomIssueId);
  const state = await loadRoomState(ctx, job.companyId, issue, agent);
  if (textParam(state.pendingTurn, "jobId") !== job.id) return { launched: false, reason: "pending_turn_changed" };
  state.pendingTurn = { ...asRecord3(state.pendingTurn), startedAt: now(), retryAt: null, retryRuntime: "agy" };
  beginRoomActivity(state, job.kind, job.id, job.sourceCommentId ?? null);
  state.runtime.activity.steps.push({ id: `quota-retry-${Date.now()}`, type: "runtime", label: "Retrying queued Room turn with Agy", status: "working", updatedAt: now() });
  await saveRoomState(ctx, job.companyId, issue.id, state, "Start due Agy provider quota Room retry");
  const runtime = await getRuntimeConfig(ctx);
  const started = startDurableRoomJob(ctx, { companyId: job.companyId, runtime, job });
  return { launched: started, reason: started ? "launched" : "room_busy" };
}
async function reconcileRoomProviderQuotaRetries(ctx, options = {}) {
  if (activeRoomQuotaRetryReconcile) return activeRoomQuotaRetryReconcile;
  const operation = (async () => {
    if (!ctx.entities?.list) return { scanned: 0, launched: 0, waiting: 0, failed: 0 };
    const current = Number(options.current) || Date.now();
    const records = await ctx.entities.list({ entityType: ROOM_JOB_ENTITY_TYPE, limit: 500 });
    const summary = { scanned: 0, launched: 0, waiting: 0, failed: 0 };
    for (const record of records) {
      const job = roomJobData(asRecord3(record.data));
      if (!isRoomProviderQuotaRetryJob(job)) continue;
      summary.scanned += 1;
      try {
        const result = await launchDueRoomProviderQuotaRetry(ctx, job, current);
        if (result.launched) summary.launched += 1;
        else summary.waiting += 1;
      } catch (error) {
        summary.failed += 1;
        ctx.logger?.warn?.("Queued Room provider quota retry could not be launched.", {
          roomIssueId: job.roomIssueId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return summary;
  })();
  activeRoomQuotaRetryReconcile = operation;
  try {
    return await operation;
  } finally {
    if (activeRoomQuotaRetryReconcile === operation) activeRoomQuotaRetryReconcile = null;
  }
}
async function cancelResolvedTaskOwnerQuotaRetry(ctx, { companyId, task, taskState, ownerRoom }) {
  if (TASK_OWNER_REPORT_STATUSES.has(task.status)) return false;
  const jobs = await listRoomJobs(ctx, ownerRoom.id);
  const agent = await ctx.agents.get(agentRoomAgentId(ownerRoom), companyId);
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  const pendingJobId = textParam(ownerState.pendingTurn, "jobId");
  const notifiedJobId = textParam(asRecord3(taskState.ownerNotification), "jobId");
  const job = jobs.find((candidate) => candidate.kind === "task_owner_report" && candidate.taskIssueId === task.id && (isRoomProviderQuotaRetryJob(candidate) || pendingJobId && candidate.id === pendingJobId));
  const resolvedJobId = job?.id || (pendingJobId && pendingJobId === notifiedJobId ? pendingJobId : "");
  if (!resolvedJobId) return false;
  if (job && ACTIVE_ROOM_JOB_STATUSES.has(job.status)) {
    await updateRoomJob(ctx, job, {
      status: "cancelled",
      completedAt: now(),
      error: `Task moved to ${task.status}; the queued owner report is no longer current.`,
      payload: { ...asRecord3(job.payload), quotaRetryAt: null }
    });
  }
  if (textParam(ownerState.pendingTurn, "jobId") === resolvedJobId) {
    ownerState.pendingTurn = null;
    ownerState.runtime ??= {};
    ownerState.runtime.quotaRetry = {
      status: "cancelled",
      runtime: "agy",
      reason: "task_status_changed",
      taskStatus: task.status,
      updatedAt: now()
    };
    finishRoomActivity(ownerState, "completed");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Release resolved Task owner report quota retry");
  }
  taskState.review = {
    ...asRecord3(taskState.review),
    status: "user_reviewed",
    reviewedAt: now(),
    updatedAt: now()
  };
  taskState.ownerNotification = {
    ...asRecord3(taskState.ownerNotification),
    status: "completed",
    taskStatus: task.status,
    jobId: resolvedJobId,
    resolvedBy: "task_status_change",
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Close obsolete Task owner report after user resolution"
  });
  return true;
}
async function roomHasActiveWork(ctx, issueId, state) {
  const processJob = activeRoomMessageJobs.get(issueId) ?? null;
  let jobs = await listRoomJobs(ctx, issueId);
  jobs = await reconcileRoomJobLedger(ctx, issueId, state, jobs);
  const persistedJob = jobs.find((job) => ACTIVE_ROOM_JOB_STATUSES.has(job.status)) ?? null;
  const pendingKind = textParam(asRecord3(state?.pendingTurn), "kind");
  const activityStatus = textParam(asRecord3(state?.runtime?.activity), "status");
  const stateBusy = Boolean(pendingKind) || ["working", "finishing"].includes(activityStatus);
  if (processJob && !persistedJob && !stateBusy) {
    if (activeRoomMessageJobs.get(issueId) === processJob) activeRoomMessageJobs.delete(issueId);
    ctx.logger?.warn?.("Released a stale in-memory Room busy marker after durable completion.", { issueId });
    return false;
  }
  return Boolean(processJob || persistedJob || stateBusy);
}
function terminalRoomJobPatchFromState(job, state) {
  if (textParam(state?.pendingTurn, "jobId") === job.id) return null;
  const activity = asRecord3(state?.runtime?.activity);
  const activityMatchesJob = textParam(activity, "jobId") === job.id;
  const status = activityMatchesJob && ["completed", "failed"].includes(textParam(activity, "status")) ? textParam(activity, "status") : "interrupted";
  return {
    status,
    completedAt: textParam(activity, "updatedAt") || now(),
    resultCommentId: activityMatchesJob ? textParam(activity, "resultCommentId") || null : null,
    error: status === "failed" ? textParam(activity, "error") || "The Room Job failed after its Codex turn started." : status === "interrupted" ? "The Room worker restarted before this Job completed. The submitted message and Room state were preserved." : null
  };
}
async function reconcileRoomJobLedger(ctx, issueId, state, knownJobs = null) {
  const jobs = knownJobs ?? await listRoomJobs(ctx, issueId);
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (!ACTIVE_ROOM_JOB_STATUSES.has(job.status)) continue;
    const patch = terminalRoomJobPatchFromState(job, state);
    if (!patch) continue;
    jobs[index] = await updateRoomJob(ctx, job, patch);
    await reconcileTaskOwnerNotificationForJob(ctx, jobs[index]).catch(() => null);
  }
  return jobs;
}
function queueRoom(roomId, work) {
  const previous = roomLocks.get(roomId) ?? Promise.resolve();
  const current = previous.catch(() => {
  }).then(work);
  roomLocks.set(roomId, current.catch(() => {
  }));
  return current;
}
function trackActiveRoomJob(ctx, issueId, promise, errorMessage = "Background Room Job failed.") {
  activeRoomMessageJobs.set(issueId, promise);
  promise.then(
    () => {
    },
    (error) => ctx.logger?.error?.(errorMessage, { issueId, message: error instanceof Error ? error.message : String(error) })
  ).finally(() => {
    if (activeRoomMessageJobs.get(issueId) === promise) activeRoomMessageJobs.delete(issueId);
  });
  return promise;
}
function queueRoomDocumentWrite(issueId, key, work) {
  const lockKey = `${issueId}:${key}`;
  const previous = roomDocumentWriteLocks.get(lockKey) ?? Promise.resolve();
  const current = previous.catch(() => {
  }).then(work);
  roomDocumentWriteLocks.set(lockKey, current);
  return current.finally(() => {
    if (roomDocumentWriteLocks.get(lockKey) === current) roomDocumentWriteLocks.delete(lockKey);
  });
}
function mostRecentComments(comments, limit = 100) {
  return [...Array.isArray(comments) ? comments : []].sort((left, right) => new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime()).slice(-limit);
}
function roomTaskBriefSnapshot(task) {
  return {
    id: task.id,
    identifier: task.identifier ?? null,
    title: task.title ?? "Untitled Task",
    status: task.status ?? "unknown",
    assigneeAgentId: task.assigneeAgentId ?? null,
    updatedAt: task.updatedAt ?? task.completedAt ?? task.createdAt ?? null
  };
}
async function listOwnedRoomTasksForBrief(ctx, companyId, issue) {
  if (!issue.projectId || typeof ctx.issues?.list !== "function") return [];
  const issues = await ctx.issues.list({ companyId, projectId: issue.projectId, limit: 500 });
  return issues.filter((candidate) => candidate.parentId === issue.id && !isLongLivedRoom(candidate)).map(roomTaskBriefSnapshot).sort((left, right) => {
    const leftReview = (/* @__PURE__ */ new Set(["in_review", "blocked"])).has(left.status) ? 0 : 1;
    const rightReview = (/* @__PURE__ */ new Set(["in_review", "blocked"])).has(right.status) ? 0 : 1;
    if (leftReview !== rightReview) return leftReview - rightReview;
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  });
}
function roomWorkOutcomeLabel(outcome) {
  if (!outcome) return "Not recorded.";
  const reference = outcome.identifier || outcome.taskId || "Room outcome";
  const status = outcome.status ? ` [${outcome.status}]` : "";
  return `${reference}${status}: ${outcome.summary || "No summary recorded."}`;
}
function roomWorkCandidateLabel(candidate) {
  if (!candidate) return "Not established.";
  return `${candidate.kind ? `${candidate.kind}: ` : ""}${candidate.summary}`;
}
function buildRoomOperatingBrief(workState, tasks = [], agent = null) {
  const active = tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status));
  const review = tasks.filter((task) => (/* @__PURE__ */ new Set(["in_review", "blocked"])).has(task.status));
  const latestTerminal = tasks.filter((task) => (/* @__PURE__ */ new Set(["done", "blocked", "cancelled"])).has(task.status)).sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()).at(0) ?? null;
  const taskLines = tasks.slice(0, 8).map((task) => {
    const reference = task.identifier || task.id;
    return `- ${reference} | ${task.status} | ${task.title} | assignee=${task.assigneeAgentId || "unassigned"}`;
  });
  const waiting = normalizeRoomWaitingFor(workState?.waitingFor);
  const references = roomWorkReferences(workState?.planReferences);
  const workerBoundary = roomWorkplaneBoundary(agent);
  const nextActionInstruction = workerBoundary ? "This Worker Room is for discussion and read-only context only. Do not perform production work here. If the current request needs a repository change, asset generation, build, external service action, or Task lifecycle operation, explain that the responsible Lead must create and assign a finite Task first." : "Decide the next action yourself; the runtime only supplies state and enforces Task ownership/collision boundaries. Interpret the current request against this state. When it clearly authorizes one in-scope reversible action, perform and report that action in this turn. If a consequential choice or multiple valid next actions remain, ask one focused question.";
  return [
    "ROOM OPERATING BRIEF (system-provided current state; not a user message or automatic controller decision).",
    "Use this small bookmark with the current user request, current AGENTS.md, repository sources, and live Task facts. Repository files remain the authority for product/design/implementation content.",
    `OBJECTIVE: ${workState?.objective || "Not established yet."}`,
    `PHASE: ${workState?.phase || "Not established yet."}`,
    `LATEST RECORDED OUTCOME: ${roomWorkOutcomeLabel(workState?.latestOutcome)}`,
    `PLAN/SOURCE POINTERS:
${references.length ? references.map((reference) => `- ${reference}`).join("\n") : "- None recorded."}`,
    `NEXT CANDIDATE: ${roomWorkCandidateLabel(workState?.nextCandidate)}`,
    `PERSISTED WAITING BOUNDARY: ${waiting.kind}${waiting.taskId ? ` | task=${waiting.taskId}` : ""}${waiting.detail ? ` | ${waiting.detail}` : ""}`,
    `LIVE OWNED TASKS (${tasks.length} total, ${active.length} active, ${review.length} needing owner review/blocker handling):
${taskLines.length ? taskLines.join("\n") : "- None."}`,
    `LATEST TERMINAL TASK: ${latestTerminal ? `${latestTerminal.identifier || latestTerminal.id} | ${latestTerminal.status} | ${latestTerminal.title}` : "None."}`,
    nextActionInstruction,
    workerBoundary,
    "When the semantic objective, phase, source pointers, latest outcome, next candidate, or waiting boundary changes, call paperclip.update_room_work_state before the final response. Do not copy full project documents or duplicate the Task list into Room Work State.",
    "END ROOM OPERATING BRIEF."
  ].join("\n\n");
}
async function prepareRoomOperatingBrief(ctx, { companyId, issue, state, agent = null }) {
  let roomAgent = agent;
  if (!roomAgent && state?.agentId && typeof ctx.agents?.get === "function") {
    roomAgent = await ctx.agents.get(state.agentId, companyId).catch(() => null);
  }
  const [workState, tasks] = await Promise.all([
    loadRoomWorkState(ctx, companyId, issue),
    listOwnedRoomTasksForBrief(ctx, companyId, issue)
  ]);
  return { workState, tasks, text: buildRoomOperatingBrief(workState, tasks, roomAgent) };
}
function buildRoomRecoveryContext(state, comments, excludedCommentId = "") {
  const checkpoint = asRecord3(state?.checkpoint);
  const checkpointSummary = trimRoomContext(checkpoint.summary, 1e4);
  const checkpointSourceId = textParam(checkpoint, "sourceCommentId");
  const excludedId = String(excludedCommentId || "").trim();
  const ordered = mostRecentComments(comments, Number.MAX_SAFE_INTEGER).filter((comment) => comment?.id !== excludedId && String(comment?.body || "").trim());
  let candidates = ordered;
  if (checkpointSummary && checkpointSourceId) {
    const checkpointIndex = ordered.findIndex((comment) => comment.id === checkpointSourceId);
    if (checkpointIndex >= 0) candidates = ordered.slice(checkpointIndex + 1);
  }
  candidates = candidates.slice(-ROOM_CONTEXT_RECOVERY_COMMENT_LIMIT);
  const selected = [];
  let used = checkpointSummary.length;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const comment = candidates[index];
    const timestamp = textParam(comment, "createdAt") || "unknown time";
    const body = trimRoomContext(comment?.body, ROOM_CONTEXT_RECOVERY_ENTRY_LIMIT);
    const entry = `[${timestamp} | comment ${comment.id || "unknown"}]
${body}`;
    if (selected.length && used + entry.length > ROOM_CONTEXT_RECOVERY_CHAR_LIMIT) break;
    selected.push(entry);
    used += entry.length;
  }
  selected.reverse();
  const latestCommentId = candidates.at(-1)?.id || checkpointSourceId || null;
  return {
    latestCommentId,
    text: [
      "ROOM CONTEXT RECOVERY FROM SPS.",
      "This is durable prior context, not a new user request. Use it to resolve references and continue the current Room conversation. Current AGENTS.md, current Task state, and current SPS tools override obsolete operating instructions in old messages.",
      `DURABLE CHECKPOINT:
${checkpointSummary || "No prior checkpoint exists. Recover from the transcript below."}`,
      `ROOM TRANSCRIPT AFTER CHECKPOINT:
${selected.join("\n\n---\n\n") || "No earlier Room comments were available."}`,
      "END ROOM CONTEXT RECOVERY."
    ].join("\n\n")
  };
}
async function prepareCodexRoomTurn(ctx, { companyId, issue, state, threadId, currentText, excludedCommentId = "" }) {
  const operating = await prepareRoomOperatingBrief(ctx, { companyId, issue, state });
  if (textParam(state?.runtime, "contextHydratedThreadId") === threadId) {
    return {
      text: `${operating.text}

CURRENT TURN REQUEST:
${currentText}`,
      hydrated: false,
      latestCommentId: null,
      workState: operating.workState
    };
  }
  const comments = typeof ctx.issues?.listComments === "function" ? await ctx.issues.listComments(issue.id, companyId) : [];
  const recovery = buildRoomRecoveryContext(state, comments, excludedCommentId);
  return {
    text: `${recovery.text}

${operating.text}

CURRENT TURN REQUEST:
${currentText}`,
    hydrated: true,
    latestCommentId: recovery.latestCommentId,
    workState: operating.workState
  };
}
async function prepareNativeRoomTurn(ctx, { companyId, issue, state, sessionId, currentText, excludedCommentId = "" }) {
  const operating = await prepareRoomOperatingBrief(ctx, { companyId, issue, state });
  if (textParam(state?.runtime, "contextHydratedNativeSessionId") === sessionId) {
    return {
      text: `${operating.text}

CURRENT TURN REQUEST:
${currentText}`,
      hydrated: false,
      latestCommentId: null,
      workState: operating.workState
    };
  }
  const comments = typeof ctx.issues?.listComments === "function" ? await ctx.issues.listComments(issue.id, companyId) : [];
  const recovery = buildRoomRecoveryContext(state, comments, excludedCommentId);
  return {
    text: `${recovery.text}

${operating.text}

CURRENT TURN REQUEST:
${currentText}`,
    hydrated: true,
    latestCommentId: recovery.latestCommentId,
    workState: operating.workState
  };
}
function markCodexRoomContextHydrated(state, threadId, prepared) {
  if (!prepared?.hydrated) return;
  state.runtime.contextHydratedThreadId = threadId;
  state.runtime.contextHydratedAt = now();
  state.runtime.contextHydratedThroughCommentId = prepared.latestCommentId ?? null;
}
function markNativeRoomContextHydrated(state, sessionId, prepared) {
  if (!prepared?.hydrated) return;
  state.runtime.contextHydratedNativeSessionId = sessionId;
  state.runtime.contextHydratedNativeAt = now();
  state.runtime.contextHydratedNativeThroughCommentId = prepared.latestCommentId ?? null;
}
async function getRuntimeConfig(ctx) {
  const config = asRecord3(await ctx.config.get());
  return {
    enabled: config.enableCodexRooms !== false,
    enableCodexRooms: config.enableCodexRooms !== false,
    enableAgyRooms: config.enableAgyRooms !== false,
    command: textParam(config, "codexCommand", "codex"),
    model: textParam(config, "codexModel", "") || null,
    codexHome: textParam(config, "codexHome", "") || null,
    codexSandbox: codexRoomSandbox(textParam(config, "codexRoomSandbox", "danger-full-access")),
    codexApprovalPolicy: codexRoomApprovalPolicy(textParam(config, "codexRoomApprovalPolicy", "never")),
    // A provider switch is an explicit product choice, not a hidden retry.
    enableAgyQuotaFallback: config.enableAgyQuotaFallback === true,
    agyFallbackCommand: textParam(config, "agyFallbackCommand", defaultAgyCommand()),
    agyFallbackModel: textParam(config, "agyFallbackModel", "gemini-3.1-pro-high"),
    agyFallbackPrintTimeout: textParam(config, "agyFallbackPrintTimeout", "2h"),
    agyFallbackTimeoutMs: Math.max(0, Number(config.agyFallbackTimeoutSec) || 0) * 1e3,
    enableTaskAssignment: config.enableTaskAssignment === true,
    // The packaged Owner Host chooses an available loopback port on first run.
    // Its process value must win over the manifest's old 3100 default; otherwise
    // Room UI can load while durable writes go to a different SPS server.
    spsApiUrl: loopbackSPSApiUrl(
      process.env.SPS_ROOM_API_URL || textParam(config, "spsApiUrl", textParam(config, "paperclipApiUrl", "http://127.0.0.1:3100"))
    )
  };
}
function isLoopbackHost2(host) {
  return (/* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1"])).has(String(host || "").trim().toLowerCase());
}
function paperclipInstanceConfigPath() {
  const configured = String(process.env.PAPERCLIP_CONFIG_PATH || "").trim();
  return configured || path2.join(os.homedir(), ".sps", "instances", "default", "config.json");
}
function environmentHasAuthenticationSecret(environmentPath) {
  try {
    const lines = fs2.readFileSync(environmentPath, "utf8").split(/\r?\n/);
    return lines.some((line) => {
      const match = /^\s*(BETTER_AUTH_SECRET|PAPERCLIP_AGENT_JWT_SECRET)\s*=\s*(.*)$/.exec(line);
      if (!match) return false;
      return match[2].trim().replace(/^['\"]|['\"]$/g, "").length > 0;
    });
  } catch {
    return false;
  }
}
function collaborationReadinessFromConfig(config, { hasAuthenticationSecret = false } = {}) {
  const server = asRecord3(asRecord3(config).server);
  const auth = asRecord3(asRecord3(config).auth);
  const deploymentMode = textParam(server, "deploymentMode", "local_trusted");
  const exposure = textParam(server, "exposure", "private");
  const listenHost = textParam(server, "host", "127.0.0.1");
  const inferredBind = isLoopbackHost2(listenHost) ? "loopback" : (/* @__PURE__ */ new Set(["0.0.0.0", "::"])).has(listenHost) ? "lan" : "custom";
  const bind = textParam(server, "bind", inferredBind);
  const port = Number(server.port) || 3100;
  const allowedHostnames = Array.isArray(server.allowedHostnames) ? server.allowedHostnames.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const checks = [];
  const warnings = [];
  const localOnlySafeDefault = deploymentMode === "local_trusted" && bind === "loopback";
  if (localOnlySafeDefault) {
    checks.push({ label: "Access mode", status: "pass", message: "Local-only mode is safely bound to this computer." });
  } else if (deploymentMode === "authenticated") {
    checks.push({
      label: "Authentication secret",
      status: hasAuthenticationSecret ? "pass" : "fail",
      message: hasAuthenticationSecret ? "An authentication secret is configured." : "Authenticated access needs BETTER_AUTH_SECRET or PAPERCLIP_AGENT_JWT_SECRET in the SPS .env file."
    });
  } else {
    checks.push({ label: "Access mode", status: "fail", message: "Non-local access must use authenticated mode." });
  }
  if (deploymentMode === "authenticated" && exposure === "private") {
    if (bind === "tailnet") {
      checks.push({ label: "Private network", status: "pass", message: "Tailnet private collaboration is configured." });
    } else if (bind === "lan") {
      checks.push({ label: "Private network", status: "warn", message: "Authenticated LAN access is configured. Prefer Tailnet for collaborators outside a trusted LAN." });
    } else {
      checks.push({ label: "Private network", status: "fail", message: "Private collaboration needs a Tailnet or trusted LAN binding." });
    }
    checks.push({
      label: "Trusted hostname",
      status: allowedHostnames.length > 0 ? "pass" : "fail",
      message: allowedHostnames.length > 0 ? `${allowedHostnames.length} trusted private hostname${allowedHostnames.length === 1 ? " is" : "s are"} configured.` : "Add the Tailnet DNS name or trusted private hostname before inviting a collaborator."
    });
  }
  if (deploymentMode === "authenticated" && exposure === "public") {
    const publicBaseUrl = textParam(auth, "publicBaseUrl");
    const hasHttpsBaseUrl = textParam(auth, "baseUrlMode") === "explicit" && publicBaseUrl.startsWith("https://");
    checks.push({
      label: "Public URL",
      status: hasHttpsBaseUrl ? "pass" : "fail",
      message: hasHttpsBaseUrl ? "A public HTTPS URL is configured." : "Public access needs an explicit HTTPS auth.publicBaseUrl."
    });
  }
  const hasFailures = checks.some((check) => check.status === "fail");
  const collaborationReady = deploymentMode === "authenticated" && bind !== "loopback" && !hasFailures;
  const state = localOnlySafeDefault ? "local_only" : collaborationReady ? "collaboration_ready" : "configuration_incomplete";
  const recommendation = state === "local_only" ? "Solo work is ready. For a friend, configure authenticated private Tailnet access rather than exposing this computer directly." : state === "collaboration_ready" ? "Invite the collaborator as an Operator, then complete the two-person browser acceptance checklist." : "Fix the failed checks, restart the Workplane, and run this check again before inviting collaborators.";
  return {
    state,
    localOnlySafeDefault,
    collaborationReady,
    server: { deploymentMode, exposure, bind, listenHost, port, allowedHostnameCount: allowedHostnames.length },
    checks,
    warnings,
    recommendation
  };
}
function readCollaborationReadiness() {
  try {
    const configPath = paperclipInstanceConfigPath();
    if (!fs2.existsSync(configPath)) {
      return {
        state: "configuration_unavailable",
        localOnlySafeDefault: false,
        collaborationReady: false,
        server: null,
        checks: [{ label: "SPS configuration", status: "fail", message: "The local SPS configuration file was not found." }],
        warnings: [],
        recommendation: "Start the Workplane once to create its local configuration, then check this page again."
      };
    }
    const config = JSON.parse(fs2.readFileSync(configPath, "utf8"));
    const environmentPath = path2.join(path2.dirname(configPath), ".env");
    return collaborationReadinessFromConfig(config, { hasAuthenticationSecret: environmentHasAuthenticationSecret(environmentPath) });
  } catch {
    return {
      state: "configuration_unavailable",
      localOnlySafeDefault: false,
      collaborationReady: false,
      server: null,
      checks: [{ label: "SPS configuration", status: "fail", message: "The local SPS configuration could not be read." }],
      warnings: [],
      recommendation: "Fix the local SPS configuration, restart the Workplane, then check this page again."
    };
  }
}
var PROVIDER_QUOTA_ERROR_RE = /(?:provider_quota|resource_exhausted|usage[_\s-]?limit|quota|rate[_\s-]?limit|too many requests|\b429\b|weekly limit|5[-\s]?hour limit)/i;
var AGY_FALLBACK_MAX_TOOL_STEPS = 10;
function errorDiagnosticText(error) {
  let data = "";
  try {
    data = JSON.stringify(error?.data ?? error?.cause ?? {});
  } catch {
    data = "";
  }
  return `${error instanceof Error ? error.message : String(error || "")}
${data}`;
}
function isProviderQuotaError(error) {
  return textParam(error, "code") === PROVIDER_QUOTA_ERROR_CODE || textParam(error, "errorFamily") === PROVIDER_QUOTA_ERROR_CODE || PROVIDER_QUOTA_ERROR_RE.test(errorDiagnosticText(error));
}
function providerQuotaRetryAtFromError(error, current = Date.now()) {
  const requestedAt = new Date(textParam(error, "retryNotBefore") || 0).getTime();
  return new Date(Math.max(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS, Number.isFinite(requestedAt) ? requestedAt : 0)).toISOString();
}
function roomToolContext(runtime, companyId, issue, agent, mode = "agent", workspaceProfile = null) {
  const workplaneIdentity = resolveAgentWorkplaneIdentity(agent);
  return {
    companyId,
    issueId: issue.id,
    projectId: issue.projectId ?? null,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role ?? null,
    workplaneRole: workplaneIdentity.roleId,
    workplaneIdentity,
    spsApiUrl: runtime.spsApiUrl,
    enableTaskAssignment: runtime.enableTaskAssignment,
    mode: roomMessageMode(mode),
    // Dynamic CLI tool calls outlive the plugin invocation. Carry the durable
    // Project routing decision into that call instead of reading plugin storage.
    workspaceProfile: asRecord3(workspaceProfile)
  };
}
function workplaneIdentityForRoomContext(roomContext) {
  if (roomContext?.workplaneIdentity?.capabilities) return roomContext.workplaneIdentity;
  return resolveAgentWorkplaneIdentity({
    name: roomContext?.agentName,
    role: roomContext?.workplaneRole || roomContext?.agentRole,
    adapterConfig: {
      workplane: asRecord3(roomContext?.workplanePolicy)
    }
  });
}
function roomHasWorkplaneCapability(roomContext, capability) {
  return hasWorkplaneCapability(workplaneIdentityForRoomContext(roomContext), capability);
}
function flatRoomToolCatalog() {
  return roomTools().flatMap((namespace) => (namespace.tools || []).map((tool) => ({
    name: `${namespace.name}.${tool.name}`,
    description: tool.description,
    inputSchema: tool.inputSchema
  })));
}
function parseAgyFallbackEnvelope(text4) {
  const raw = enforceUtf8Text(String(text4 || "").trim(), "Agy fallback output");
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() || raw;
  let value;
  try {
    value = JSON.parse(fenced);
  } catch {
    return { type: "final", message: raw };
  }
  const record = asRecord3(value);
  if (textParam(record, "type") === "tool_call") {
    return {
      type: "tool_call",
      name: textParam(record, "name"),
      arguments: asRecord3(record.arguments)
    };
  }
  if (textParam(record, "type") === "final" && textParam(record, "message")) {
    return { type: "final", message: rawTextParam(record, "message").trim() };
  }
  return { type: "final", message: raw };
}
function agyFallbackProtocolPrompt({ agent, state, instructions, preparedText, stagedAttachments, history }) {
  const files = stagedAttachments.length ? stagedAttachments.map((attachment) => `- ${roomAttachmentName(attachment)}: ${attachment.localPath}`).join("\n") : "None";
  return [
    `You are ${agent.name}, continuing the same long-lived SPS Room turn because its primary Codex account reached provider quota.`,
    "Follow the managed AGENTS.md and the exact current Room request. Do not mention runtime failover unless it materially affects the requested result.",
    "SPS mutations are allowed only through the JSON tool protocol below. Never claim a Task, comment, status, or memory mutation unless the corresponding tool result says ok=true.",
    roomWorkplaneBoundary(agent),
    "Return exactly one JSON object and no surrounding prose on each step.",
    'To call a tool: {"type":"tool_call","name":"paperclip.tool_name","arguments":{...}}',
    'To answer the user: {"type":"final","message":"complete Markdown response"}',
    `MANAGED AGENTS.md:
${trimRoomContext(instructions, 16e3) || "No additional role instructions were supplied."}`,
    `DURABLE CHECKPOINT:
${trimRoomContext(state?.checkpoint?.summary, 6e3) || "No checkpoint exists yet."}`,
    `AVAILABLE PAPERCLIP TOOLS:
${JSON.stringify(flatRoomToolCatalog())}`,
    `ATTACHED LOCAL FILES:
${files}`,
    `CURRENT ROOM CONTEXT AND REQUEST:
${preparedText}`,
    history.length ? `TOOL PROTOCOL HISTORY:
${history.join("\n\n")}` : "TOOL PROTOCOL HISTORY:\nNone",
    "Return the next single JSON object now."
  ].join("\n\n");
}
async function runAgyRoomFallback(ctx, {
  runtime,
  companyId,
  issue,
  agent,
  state,
  workingDirectory,
  preparedText,
  stagedAttachments = [],
  mode = "agent"
}) {
  const fallbackRuntime = roomRuntimeWithRoomSafety(agent, {
    kind: "agy_print",
    command: runtime.agyFallbackCommand || defaultAgyCommand(),
    model: runtime.agyFallbackModel || "gemini-3.1-pro-high",
    sandbox: false,
    timeoutMs: runtime.agyFallbackTimeoutMs || 0,
    extraArgs: ["--print-timeout", runtime.agyFallbackPrintTimeout || "2h"],
    env: {}
  });
  const client = testAgyClientFactory ? testAgyClientFactory({ roomRuntime: fallbackRuntime, workingDirectory, agent, fallback: true }) : new AgyRoomClient({
    command: fallbackRuntime.command,
    cwd: workingDirectory,
    env: process.env,
    model: fallbackRuntime.model,
    sandbox: false,
    extraArgs: fallbackRuntime.extraArgs,
    requestTimeoutMs: fallbackRuntime.timeoutMs
  });
  const syntheticThreadId = `agy-fallback-${randomUUID2()}`;
  const fallbackWorkspaces = await listProjectWorkspaces(ctx, companyId, issue.projectId);
  const fallbackWorkspaceProfile = await loadProjectWorkspaceProfile(ctx, issue.projectId, fallbackWorkspaces);
  const fallbackMode = isWorkerOnlyRoomAgent(agent) ? "ask" : mode;
  activeThreadContexts.set(syntheticThreadId, roomToolContext(runtime, companyId, issue, agent, fallbackMode, fallbackWorkspaceProfile));
  const instructions = loadAgentInstructions(agent);
  const history = [];
  try {
    for (let step = 0; step < AGY_FALLBACK_MAX_TOOL_STEPS; step += 1) {
      const prompt = agyFallbackProtocolPrompt({ agent, state, instructions, preparedText, stagedAttachments, history });
      const started = client.startTurn({ prompt });
      const turn = await started.completion;
      const envelope = parseAgyFallbackEnvelope(turnResultText(turn));
      if (envelope.type === "final") {
        return {
          items: [{ id: `message-agy-fallback-${randomUUID2()}`, type: "agentMessage", text: enforceUtf8Text(envelope.message, "Agy fallback final response") }],
          provider: "agy",
          fallbackFrom: "codex",
          turnId: started.turnId
        };
      }
      const [namespace, tool, extra] = envelope.name.split(".");
      if (namespace !== "paperclip" || !tool || extra) {
        throw new Error(`Agy fallback requested an unavailable tool: ${envelope.name || "missing name"}`);
      }
      const response = await handleCodexServerRequest(ctx, {
        method: "item/tool/call",
        params: {
          threadId: syntheticThreadId,
          namespace,
          tool,
          arguments: envelope.arguments,
          callId: `agy-fallback-call-${randomUUID2()}`
        }
      });
      const resultText = response?.contentItems?.map((item) => item?.text || "").join("\n").trim() || "{}";
      history.push(`TOOL CALL ${step + 1}: ${JSON.stringify(envelope)}
TOOL RESULT ${step + 1}: ${trimRoomContext(resultText, 16e3)}`);
    }
    throw new Error(`Agy fallback exceeded ${AGY_FALLBACK_MAX_TOOL_STEPS} SPS tool steps.`);
  } finally {
    activeThreadContexts.delete(syntheticThreadId);
    client.stop?.();
  }
}
function codexCompletionWithAgyFallback(ctx, input) {
  return Promise.resolve(input.completion).catch(async (error) => {
    if (!input.runtime.enableAgyQuotaFallback || !isProviderQuotaError(error)) throw error;
    input.state.runtime ??= {};
    input.state.runtime.lastFailover = {
      from: "codex",
      to: "agy",
      reason: PROVIDER_QUOTA_ERROR_CODE,
      model: input.runtime.agyFallbackModel || "gemini-3.1-pro-high",
      at: now()
    };
    const activity = asRecord3(input.state.runtime.activity);
    if (Array.isArray(activity.steps)) {
      activity.steps.push({ id: `agy-fallback-${Date.now()}`, type: "runtime", label: "Codex quota reached; continuing with Agy", status: "working", updatedAt: now() });
      activity.updatedAt = now();
    }
    await saveRoomStateOutsideInvocation(input.runtime.spsApiUrl, input.issue.id, input.state, "Record Codex provider quota failover to Agy").catch(() => null);
    return runAgyRoomFallback(ctx, input);
  });
}
async function getCodexClient(ctx, runtime, agent) {
  if (testCodexClient) return testCodexClient;
  const key = codexClientKey(runtime, agent);
  const existing = codexClients.get(key);
  if (existing) return existing;
  const codexHome = resolveCodexHomeForAgent(runtime, agent);
  const client = new CodexAppServerClient({
    command: runtime.command,
    env: codexHome ? { ...process.env, CODEX_HOME: codexHome } : process.env,
    onServerRequest: (request) => handleCodexServerRequest(ctx, request)
  });
  client.onNotification((message) => {
    void recordNativeCodexCompaction(ctx, message);
  });
  codexClients.set(key, client);
  try {
    await client.start();
    return client;
  } catch (error) {
    codexClients.delete(key);
    client.stop();
    throw error;
  }
}
async function openThread(ctx, runtime, state, companyId, issue, agent) {
  const projectWorkspaces = await listProjectWorkspaces(ctx, companyId, issue.projectId);
  const workspaceProfile = await loadProjectWorkspaceProfile(ctx, issue.projectId, projectWorkspaces);
  const instructions = loadAgentInstructions(agent);
  const instructionsFingerprint = agentInstructionsFingerprint(agent, instructions);
  const roomRuntime = roomRuntimeWithRoomSafety(agent, agentRoomRuntime(runtime, agent));
  if (!roomRuntime.enabled) throw new Error(roomRuntimeDisabledResult(roomRuntime).message);
  const workingDirectory = isWorkerOnlyRoomAgent(agent) && roomRuntime.kind === "agy_print" ? workerRoomSandboxDirectory(companyId, issue, agent) : await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state);
  if (roomRuntime.kind === "agy_print") {
    const client2 = testAgyClientFactory ? testAgyClientFactory({ roomRuntime, workingDirectory, agent }) : new AgyRoomClient({
      command: roomRuntime.command,
      cwd: workingDirectory,
      env: { ...process.env, ...roomRuntime.env },
      model: roomRuntime.model,
      sandbox: roomRuntime.sandbox,
      extraArgs: roomRuntime.extraArgs,
      requestTimeoutMs: roomRuntime.timeoutMs
    });
    state.runtime ??= {};
    state.runtime.kind = "agy_print";
    state.runtime.codexThreadId = null;
    state.runtime.instructionsFingerprint = instructionsFingerprint;
    delete state.runtime.codexAccountKey;
    delete state.runtime.codexHome;
    state.runtime.agyCommand = roomRuntime.command;
    state.runtime.model = roomRuntime.model;
    state.runtime.updatedAt = now();
    return {
      client: client2,
      threadId: null,
      roomRuntime,
      workingDirectory,
      agyContext: { agent, instructions, state, workingDirectory }
    };
  }
  const client = await getCodexClient(ctx, roomRuntime, agent);
  state.runtime ??= {};
  const storedThreadId = textParam(state.runtime, "codexThreadId") || null;
  const storedInstructionsFingerprint = textParam(state.runtime, "instructionsFingerprint") || null;
  const instructionsChanged = Boolean(storedThreadId) && storedInstructionsFingerprint !== instructionsFingerprint;
  if (instructionsChanged) {
    state.runtime.lastThreadRotation = {
      threadId: storedThreadId,
      reason: storedInstructionsFingerprint ? "agent_instructions_changed" : "agent_instructions_fingerprint_initialized",
      rotatedAt: now()
    };
    delete state.runtime.contextHydratedThreadId;
    delete state.runtime.contextHydratedAt;
    delete state.runtime.contextHydratedThroughCommentId;
  }
  const requestedThreadId = roomThreadIdForCodexRuntime(state, roomRuntime, agent, instructionsFingerprint);
  const threadOptions = {
    threadId: requestedThreadId,
    cwd: workingDirectory,
    model: roomRuntime.model,
    developerInstructions: agentInstructions(state, agent, instructions),
    sandbox: roomRuntime.sandbox,
    approvalPolicy: roomRuntime.approvalPolicy,
    dynamicTools: roomTools()
  };
  let thread;
  try {
    thread = await client.openRoomThread(threadOptions);
  } catch (error) {
    if (!requestedThreadId) throw error;
    ctx.logger?.warn?.("Stored Codex Room thread could not be resumed; starting a recoverable replacement.", {
      issueId: issue.id,
      threadId: requestedThreadId,
      message: error instanceof Error ? error.message : String(error)
    });
    thread = await client.openRoomThread({ ...threadOptions, threadId: null });
  }
  if (!thread?.id) throw new Error("Codex app-server did not return a Room thread id.");
  activeThreadContexts.set(thread.id, roomToolContext(runtime, companyId, issue, agent, effectiveRoomMessageMode(agent), workspaceProfile));
  state.runtime.codexThreadId = thread.id;
  state.runtime.kind = "codex_app_server";
  state.runtime.model = roomRuntime.model;
  state.runtime.reasoningEffort = roomRuntime.reasoningEffort;
  state.runtime.instructionsFingerprint = instructionsFingerprint;
  state.runtime.codexAccountKey = codexClientKey(roomRuntime, agent);
  state.runtime.codexHome = resolveCodexHomeForAgent(roomRuntime, agent);
  state.runtime.updatedAt = now();
  return { client, threadId: thread.id, roomRuntime, workingDirectory, agyContext: null };
}
function requireUserAction(actionCtx) {
  if (actionCtx?.actor?.type !== "user" || !actionCtx.companyId) {
    throw new Error("Room Chat actions require an authenticated SPS user.");
  }
  return actionCtx.companyId;
}
function requireAgentConfigurationAction(actionCtx) {
  const companyId = requireUserAction(actionCtx);
  if (!actionCtx?.actor?.permissions?.includes("agents:configure")) {
    throw new Error("Only company owners or admins with Agent configuration permission can change Workplane policies or CLI account connections.");
  }
  return companyId;
}
function isAbsoluteWorkspacePath(value) {
  const pathValue = String(value || "").trim();
  return pathValue.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathValue);
}
function workspaceNameFromInput(name, cwd, repoUrl) {
  const explicit = String(name || "").trim();
  if (explicit) return explicit;
  const localName = String(cwd || "").trim().replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1);
  if (localName) return localName;
  try {
    const url = new URL(String(repoUrl || ""));
    return url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).at(-1)?.replace(/\.git$/i, "") || "Workspace";
  } catch {
    return "Workspace";
  }
}
async function handleWorkspaceProfileAccess(_ctx, _params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  return {
    companyId,
    canConfigure: Boolean(actionCtx?.actor?.permissions?.includes("agents:configure"))
  };
}
async function handleWorkspaceProfileSave(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const projectId = textParam(params, "projectId");
  if (!projectId) throw new Error("projectId is required.");
  const project = await ctx.projects.get(projectId, companyId);
  if (!project) throw new Error("Project was not found.");
  const workspaces = await listProjectWorkspaces(ctx, companyId, projectId);
  if (!Array.isArray(workspaces)) throw new Error("Project Workspace access is unavailable.");
  const profile = await saveProjectWorkspaceProfile(ctx, projectId, asRecord3(params).profile, workspaces);
  return { ok: true, profile };
}
async function handleWorkspaceProfileCreateWorkspace(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const projectId = textParam(params, "projectId");
  const cwd = rawTextParam(params, "cwd").trim();
  const repoUrl = rawTextParam(params, "repoUrl").trim();
  if (!projectId) throw new Error("projectId is required.");
  if (!cwd && !repoUrl) throw new Error("A local folder or repository URL is required.");
  if (cwd && !isAbsoluteWorkspacePath(cwd)) throw new Error("Workspace local folder must be an absolute path.");
  const project = await ctx.projects.get(projectId, companyId);
  if (!project) throw new Error("Project was not found.");
  if (!ctx.projects?.createWorkspace) throw new Error("This SPS server does not yet expose the Workspace write bridge required by Workplane.");
  const created = await ctx.projects.createWorkspace(projectId, {
    name: workspaceNameFromInput(rawTextParam(params, "name"), cwd, repoUrl),
    ...cwd ? { cwd } : {},
    ...repoUrl ? { repoUrl } : {},
    sourceType: cwd ? "local_path" : "git_repo",
    isPrimary: asRecord3(params).isPrimary === true
  }, companyId);
  if (!created) throw new Error("SPS could not create the Project Workspace.");
  const workspaces = await listProjectWorkspaces(ctx, companyId, projectId);
  const existing = await loadProjectWorkspaceProfile(ctx, projectId, workspaces);
  const profile = await saveProjectWorkspaceProfile(ctx, projectId, {
    ...existing,
    defaultWorkspaceId: existing.configured ? existing.defaultWorkspaceId : created.id
  }, workspaces);
  return { ok: true, workspace: created, profile };
}
function turnResultText(turn) {
  const text4 = getAgentText(turn);
  if (!text4) throw new Error("The Room runtime completed without an assistant message.");
  return enforceUtf8Text(text4, "Room runtime output");
}
function beginRoomActivity(state, kind, jobId = null, sourceCommentId = null) {
  const timestamp = now();
  state.runtime ??= {};
  state.runtime.activity = {
    status: "working",
    kind,
    jobId,
    sourceCommentId,
    turnId: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    steps: [{ id: "turn", type: "turn", label: "\uC694\uCCAD\uC744 \uBD84\uC11D\uD558\uB294 \uC911", status: "working", updatedAt: timestamp }],
    error: null
  };
  return state.runtime.activity;
}
function roomActivityLabel(type, status) {
  const base = {
    reasoning: "\uC694\uCCAD \uBD84\uC11D",
    plan: "\uC791\uC5C5 \uACC4\uD68D \uC815\uB9AC",
    commandExecution: "\uB3C4\uAD6C \uC2E4\uD589",
    fileChange: "\uD30C\uC77C \uBCC0\uACBD \uD655\uC778",
    mcpToolCall: "\uC5F0\uACB0 \uB3C4\uAD6C \uC0AC\uC6A9",
    dynamicToolCall: "SPS \uC791\uC5C5 \uB3C4\uAD6C \uC0AC\uC6A9",
    collabAgentToolCall: "\uD611\uC5C5 Agent \uB3C4\uAD6C \uC0AC\uC6A9",
    webSearch: "\uC6F9 \uAC80\uC0C9",
    imageView: "\uC774\uBBF8\uC9C0 \uD655\uC778",
    agentMessage: "\uB2F5\uBCC0 \uC791\uC131"
  }[type] ?? "\uC791\uC5C5 \uC9C4\uD589";
  return status === "completed" ? `${base} \uC644\uB8CC` : `${base} \uC911`;
}
function applyRoomActivityEvent(state, event) {
  const activity = state.runtime?.activity;
  if (!activity || activity.status !== "working") return false;
  const params = event?.params ?? {};
  const timestamp = now();
  if (event?.method === "turn/started") {
    activity.turnId = params.turnId ?? activity.turnId;
    activity.updatedAt = timestamp;
    return true;
  }
  if (!["item/started", "item/completed"].includes(event?.method) || !params.item?.type) return false;
  const status = event.method === "item/completed" ? "completed" : "working";
  const item = params.item;
  const id = item.id ?? `${item.type}:${params.turnId ?? activity.steps.length}`;
  const index = activity.steps.findIndex((step) => step.id === id);
  const priorStep = index >= 0 ? activity.steps[index] : null;
  const reasoningSummary = item.type === "reasoning" && Array.isArray(item.summary) ? item.summary.map((entry) => String(entry || "").trim()).filter(Boolean).join("\n").slice(0, 1800) : priorStep?.summary ?? null;
  const nextStep = {
    id,
    type: item.type,
    label: roomActivityLabel(item.type, status),
    status,
    updatedAt: timestamp,
    ...reasoningSummary ? { summary: reasoningSummary } : {}
  };
  if (index >= 0) activity.steps[index] = nextStep;
  else activity.steps.push(nextStep);
  activity.steps = activity.steps.slice(-12);
  activity.turnId = params.turnId ?? activity.turnId;
  activity.updatedAt = timestamp;
  return true;
}
function applyNativeSessionActivityEvent(state, event) {
  const activity = state.runtime?.activity;
  if (!activity || activity.status !== "working" || !event?.runId) return false;
  activity.turnId = event.runId;
  activity.updatedAt = now();
  if (event.eventType === "status") {
    const step = {
      id: "agent-session-status",
      type: "status",
      label: String(event.message || "Agent run status updated").trim().slice(0, 180),
      status: "working",
      updatedAt: activity.updatedAt
    };
    const index = activity.steps.findIndex((candidate) => candidate.id === step.id);
    if (index >= 0) activity.steps[index] = step;
    else activity.steps.push(step);
    return true;
  }
  if (event.eventType !== "chunk") return false;
  const payload = asRecord3(event.payload);
  const nestedPayload = asRecord3(payload.payload);
  const toolName = textParam(payload, "currentToolName") || textParam(nestedPayload, "toolName");
  const eventType = textParam(payload, "eventType") || textParam(nestedPayload, "type") || "progress";
  const summary = (textParam(payload, "lastAssistantSnippet") || textParam(event, "message") || textParam(payload, "message")).slice(0, 900);
  const label = toolName ? `Using ${toolName}` : eventType === "reasoning" ? "Reviewing context" : eventType === "assistant" ? "Preparing the response" : "Agent work in progress";
  activity.steps.push({
    id: `agent-session:${event.seq ?? activity.steps.length}`,
    type: toolName ? "tool" : eventType,
    label,
    status: "working",
    updatedAt: activity.updatedAt,
    ...summary ? { summary } : {}
  });
  activity.steps = activity.steps.slice(-20);
  return true;
}
function finishRoomActivity(state, status, error = null) {
  const activity = state.runtime?.activity;
  if (!activity) return;
  activity.status = status;
  activity.error = error ? String(error instanceof Error ? error.message : error).slice(0, 180) : null;
  activity.updatedAt = now();
}
function roomReasoningSummary(state) {
  const summaries = (state.runtime?.activity?.steps ?? []).filter((step) => step.type === "reasoning" && step.summary).map((step) => step.summary).filter((summary, index, all) => all.indexOf(summary) === index);
  return summaries.join("\n\n").slice(0, 3600);
}
function roomActivityReporter(ctx, companyId, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomState(ctx, companyId, issueId, state, changeSummary)).catch(() => {
    });
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1e3 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update Room activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update Room activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyRoomActivityEvent(state, event)) return;
      dirty = true;
      emitRoomEvent(ctx, companyId, issueId, { type: "activity", activity: state.runtime?.activity ?? null });
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final Room activity");
      return writes;
    }
  };
}
function nativeRoomActivityReporter(ctx, companyId, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomState(ctx, companyId, issueId, state, changeSummary)).catch(() => {
    });
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1e3 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update native Agent Session activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update native Agent Session activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyNativeSessionActivityEvent(state, event)) return;
      dirty = true;
      emitRoomEvent(ctx, companyId, issueId, { type: "activity", activity: state.runtime?.activity ?? null });
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final native Agent Session activity");
      return writes;
    }
  };
}
function roomActivityReporterOutsideInvocation(apiUrl, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary)).catch(() => {
    });
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1e3 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update Room activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update Room activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyRoomActivityEvent(state, event)) return;
      dirty = true;
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final Room activity");
      return writes;
    }
  };
}
function nativeRoomActivityReporterOutsideInvocation(apiUrl, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary)).catch(() => {
    });
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1e3 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update native Agent Session activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update native Agent Session activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyNativeSessionActivityEvent(state, event)) return;
      dirty = true;
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final native Agent Session activity");
      return writes;
    }
  };
}
async function getActiveTasksDirect(apiUrl, companyId, projectId, roomIssueId) {
  if (!projectId) return [];
  const issues = await listCompanyIssuesDirect(apiUrl, companyId, projectId);
  return issues.filter((issue) => issue.id !== roomIssueId && issue.parentId && ACTIVE_TASK_STATUSES.has(issue.status));
}
function declaredList(text4, heading) {
  const pattern = new RegExp(`${heading}:\\s*([\\s\\S]*?)(?:\\n\\n|$)`, "i");
  const match = String(text4 || "").match(pattern);
  if (!match) return [];
  return match[1].split(/[,\n]/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}
function declaredPaths(text4) {
  return declaredList(text4, "Affected Paths");
}
function normalizeAffectedPath(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/\/(?:\*\*?|)$/g, "").toLowerCase();
}
function affectedPathsOverlap(left, right) {
  const a = normalizeAffectedPath(left);
  const b = normalizeAffectedPath(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
function pathsConflict(existingPaths, requestedPaths) {
  return existingPaths.some((existing) => requestedPaths.some((requested) => affectedPathsOverlap(existing, requested)));
}
function declaredDesignReferences(text4) {
  return declaredList(text4, "Design References");
}
function gitStatusLabel(code) {
  if (code === "??") return "untracked";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";
  if (code.includes("R")) return "renamed";
  return "modified";
}
function workspaceGitChanges(workspace) {
  const cwd = String(workspace?.cwd ?? workspace?.path ?? "").trim();
  const name = String(workspace?.name ?? "Workspace");
  const kind = String(asRecord3(workspace?.metadata).kind ?? "implementation");
  if (!cwd || !fs2.existsSync(cwd)) {
    return { id: workspace?.id ?? null, name, kind, available: false, files: [] };
  }
  try {
    const repositoryRoot = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      windowsHide: true
    }).trim();
    const workspaceRelativeRoot = path2.relative(repositoryRoot, cwd).replace(/\\/g, "/").replace(/^\.\/$/, "");
    const workspacePrefix = workspaceRelativeRoot && !workspaceRelativeRoot.startsWith("../") && workspaceRelativeRoot !== ".." ? workspaceRelativeRoot.replace(/\/+$/, "") : "";
    const output = execFileSync("git", ["-c", "core.quotepath=false", "-C", cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      windowsHide: true
    });
    const entries = output.split("\0").filter(Boolean);
    const files = [];
    for (let index = 0; index < entries.length && files.length < 100; index += 1) {
      const entry = entries[index];
      const code = entry.slice(0, 2).trim() || "M";
      const repositoryPath = entry.slice(3).replace(/\\/g, "/");
      const scopedPath = workspacePrefix ? repositoryPath === workspacePrefix ? path2.posix.basename(repositoryPath) : repositoryPath.startsWith(`${workspacePrefix}/`) ? repositoryPath.slice(workspacePrefix.length + 1) : null : repositoryPath;
      if (!scopedPath) {
        if ((code.includes("R") || code.includes("C")) && index + 1 < entries.length) index += 1;
        continue;
      }
      const file = {
        workspaceId: workspace?.id ?? null,
        workspaceName: name,
        workspaceKind: kind,
        status: gitStatusLabel(code),
        path: scopedPath
      };
      if (file.path) files.push(file);
      if ((code.includes("R") || code.includes("C")) && index + 1 < entries.length) index += 1;
    }
    return { id: workspace?.id ?? null, name, kind, available: true, files };
  } catch {
    return { id: workspace?.id ?? null, name, kind, available: false, files: [] };
  }
}
function workspaceKindForAgent(agent) {
  const name = String(agent?.name || "").toLowerCase();
  return name === "manager" || name === "designer" || name.includes("document") ? "design" : "implementation";
}
function taskFileReferences(tasks) {
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const task of tasks) {
    const add = (kind, path3) => {
      const cleanPath = String(path3 || "").trim();
      if (!cleanPath || /^Not (declared|required)/i.test(cleanPath)) return;
      const key = `${kind}:${cleanPath}`;
      if (seen.has(key)) return;
      seen.add(key);
      files.push({ kind, path: cleanPath, taskId: task.id, taskIdentifier: task.identifier, taskTitle: task.title });
    };
    for (const reference of declaredDesignReferences(task.description)) add("design_reference", reference);
    for (const path3 of declaredPaths(task.description)) add("task_target", path3);
  }
  return files;
}
async function previewTaskDirect(apiUrl, companyId, projectId, roomIssueId, affectedPaths) {
  const activeTasks = await getActiveTasksDirect(apiUrl, companyId, projectId, roomIssueId);
  const normalizedPaths = [...new Set(affectedPaths.map((path3) => path3.trim()).filter(Boolean))];
  const conflicts = activeTasks.filter((task) => pathsConflict(declaredPaths(task.description), normalizedPaths));
  return {
    affectedPaths: normalizedPaths,
    activeTasks: activeTasks.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      declaredAffectedPaths: declaredPaths(task.description)
    })),
    conflicts: conflicts.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      declaredAffectedPaths: declaredPaths(task.description)
    }))
  };
}
async function getProjectTaskDirect(apiUrl, companyId, projectId, taskId) {
  const task = await getIssueDirect(apiUrl, taskId);
  if (!task || task.companyId !== companyId || task.projectId !== projectId || !task.parentId) {
    throw new Error("Task must be a child Task Room in the current project.");
  }
  return task;
}
async function getOwnedTaskRoomDirect(roomContext, taskId) {
  const task = await getProjectTaskDirect(
    roomContext.spsApiUrl,
    roomContext.companyId,
    roomContext.projectId,
    taskId
  );
  const stateDocument = await getRoomDocumentDirect(roomContext.spsApiUrl, task.id, TASK_ROOM_STATE_KEY);
  const state = parseState(stateDocument?.body);
  if (task.parentId !== roomContext.issueId || state?.kind !== "task_room" || state.originatingRoomIssueId !== roomContext.issueId || state.owningAgentId !== roomContext.agentId) {
    throw new Error("Only the Agent Room that created this Task can modify or complete it.");
  }
  return { task, state };
}
async function handleCodexServerRequest(ctx, request) {
  if (request.method !== "item/tool/call") throw new Error(`Unsupported Codex request: ${request.method}`);
  const params = request.params ?? {};
  const roomContext = activeThreadContexts.get(params.threadId);
  if (!roomContext) throw new Error("Codex tool call does not belong to an active Room.");
  const name = `${params.namespace || ""}.${params.tool || ""}`.replace(/^\./, "");
  const args = asRecord3(params.arguments);
  let content;
  try {
    if (!roomModeAllowsTool(roomContext.mode, name)) {
      content = JSON.stringify({
        ok: false,
        code: "tool_not_available_in_room_mode",
        mode: roomMessageMode(roomContext.mode),
        message: `${roomMessageModeLabel(roomContext.mode)} does not permit ${name}. Switch to Agent mode only when the user wants real work performed.`
      });
    } else if (name === "paperclip.memory_search") {
      const memoryAccess = workplaneIdentityForRoomContext(roomContext).memoryAccess;
      const query = textParam(args, "query");
      const limit = Math.max(1, Math.min(Number(args.limit) || 5, 10));
      if (memoryAccess === "none") {
        content = JSON.stringify({ ok: false, code: "memory_read_disabled", message: "This Agent's Organization policy does not allow SPS memory search." });
      } else if (!query || query.length > 500) {
        content = JSON.stringify({ ok: false, code: "invalid_memory_query", message: "Memory search queries must be between 1 and 500 characters." });
      } else {
        const items = await searchRoomMemory(roomContext, query, listParam(args, "scopes"), limit);
        content = JSON.stringify({ ok: true, items }, null, 2);
      }
    } else if (name === "paperclip.memory_propose") {
      const memoryAccess = workplaneIdentityForRoomContext(roomContext).memoryAccess;
      if (memoryAccess !== "read_write") {
        content = JSON.stringify({ ok: false, code: "memory_write_disabled", message: "This Agent's Organization policy allows read-only or no SPS memory access." });
      } else {
        const candidate = await proposeRoomMemory(roomContext, args);
        content = JSON.stringify({ ok: true, candidateId: candidate?.id ?? null, status: candidate?.status ?? "candidate" });
      }
    } else if (name === "paperclip.update_room_work_state") {
      const mutableFields = ["objective", "phase", "latestOutcome", "planReferences", "nextCandidate", "waitingFor"];
      const patch = Object.fromEntries(mutableFields.filter((key) => Object.prototype.hasOwnProperty.call(args, key)).map((key) => [key, args[key]]));
      if (!Object.keys(patch).length) {
        content = JSON.stringify({ ok: false, code: "work_state_patch_required", message: "Provide at least one Room Work State field to update." });
      } else {
        const workState = await updateRoomWorkStateOutsideInvocation(
          roomContext,
          patch,
          `Update Room operating bookmark from ${roomContext.agentName}`,
          { kind: "agent", agentId: roomContext.agentId, agentName: roomContext.agentName }
        );
        content = JSON.stringify({ ok: true, workState }, null, 2);
      }
    } else if (name === "paperclip.list_active_tasks") {
      const activeTasks = await getActiveTasksDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, roomContext.issueId);
      content = JSON.stringify(activeTasks.map((task) => ({
        id: task.id,
        identifier: task.identifier,
        title: task.title,
        status: task.status,
        assigneeAgentId: task.assigneeAgentId ?? null,
        declaredAffectedPaths: declaredPaths(task.description)
      })), null, 2);
    } else if (name === "paperclip.list_workers") {
      if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) {
        content = JSON.stringify({ ok: false, code: "agent_cannot_assign_tasks", message: "This Agent is not configured as a Lead that can assign Worker Tasks." });
      } else {
        const ownerIdentity = workplaneIdentityForRoomContext(roomContext);
        const agents = await listCompanyAgentsDirect(roomContext.spsApiUrl, roomContext.companyId);
        content = JSON.stringify(agents.filter((agent) => canDelegateTo(ownerIdentity, agent)).map((agent) => {
          const identity = resolveAgentWorkplaneIdentity(agent);
          return {
            id: agent.id,
            name: agent.name,
            role: agent.role ?? null,
            workplaneRole: identity.roleId,
            workplaneKind: identity.kind,
            status: agent.status,
            adapterType: agent.adapterType ?? null,
            maxConcurrentRuns: Number(asRecord3(asRecord3(agent.runtimeConfig).heartbeat).maxConcurrentRuns) || 1
          };
        }), null, 2);
      }
    } else if (name === "paperclip.preview_task") {
      if (!roomContext.projectId) {
        content = JSON.stringify({ ok: false, code: "missing_project", message: "An Agent Room must belong to a project before it can preview Tasks." });
      } else {
        const preview = await previewTaskDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, roomContext.issueId, listParam(args, "affectedPaths"));
        content = JSON.stringify({ ok: true, ...preview }, null, 2);
      }
    } else if (name === "paperclip.create_task") {
      if (roomContext.enableTaskAssignment !== true) {
        content = JSON.stringify({
          ok: false,
          code: "task_assignment_disabled",
          message: "Worker Task assignment is disabled until the organization adapters are explicitly configured and enabled."
        });
      } else if (!roomContext.projectId) {
        content = JSON.stringify({ ok: false, code: "missing_project", message: "An Agent Room must belong to a project before it can create Tasks." });
      } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_CREATE)) {
        content = JSON.stringify({ ok: false, code: "agent_cannot_create_tasks", message: "Only a configured Lead can create Worker Tasks." });
      } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) {
        content = JSON.stringify({ ok: false, code: "agent_cannot_assign_tasks", message: "This Lead is not configured to assign Worker Tasks." });
      } else {
        const title = enforceTaskContractText(textParam(args, "title"), "Task title");
        const description = enforceTaskContractText(textParam(args, "description"), "Task description");
        const assigneeAgentId = textParam(args, "assigneeAgentId");
        const requestedTaskType = textParam(args, "taskType", "implementation");
        const taskType = normalizedTaskTypeKey(requestedTaskType);
        const maturity = textParam(args, "maturity");
        const affectedPaths = listParam(args, "affectedPaths");
        const designReferences = listParam(args, "designReferences");
        const acceptanceCriteria = listParam(args, "acceptanceCriteria");
        const verification = listParam(args, "verification");
        const blockedByIssueIds = [...new Set(listParam(args, "blockedByIssueIds"))];
        const requestedProjectWorkspaceId = textParam(args, "projectWorkspaceId");
        const projectWorkspaces = await listProjectWorkspacesDirect(roomContext.spsApiUrl, roomContext.projectId);
        const companyAgents = await listCompanyAgentsDirect(roomContext.spsApiUrl, roomContext.companyId);
        const selectedWorker = companyAgents.find((candidate) => candidate.id === assigneeAgentId) ?? null;
        const workspaceProfile = normalizeWorkspaceProfile(asRecord3(roomContext.workspaceProfile), projectWorkspaces);
        const taskWorkspace = chooseTaskWorkspace(
          projectWorkspaces,
          taskType,
          requestedProjectWorkspaceId,
          workspaceProfile,
          selectedWorker?.id ?? assigneeAgentId
        );
        const affectedPathResolution = normalizeTaskAffectedPaths(affectedPaths, taskWorkspace);
        const taskAffectedPaths = affectedPathResolution.paths;
        if (!title || !description || !assigneeAgentId || !maturity) {
          content = JSON.stringify({ ok: false, code: "invalid_task", message: "title, description, assigneeAgentId, and maturity are required." });
        } else if (!taskType) {
          content = JSON.stringify({ ok: false, code: "invalid_task_type", message: "taskType must use a lowercase key containing only letters, numbers, hyphens, or underscores." });
        } else if (!TASK_MATURITY_LEVELS.has(maturity)) {
          content = JSON.stringify({ ok: false, code: "invalid_task_maturity", message: "maturity must be exploration, prototype, or committed implementation." });
        } else if (!selectedWorker || !canDelegateTo(workplaneIdentityForRoomContext(roomContext), selectedWorker)) {
          content = JSON.stringify({ ok: false, code: "invalid_worker", message: "Choose a Worker allowed by this Lead's Delegation Policy." });
        } else if (Array.isArray(projectWorkspaces) && !taskWorkspace) {
          content = JSON.stringify({ ok: false, code: "workspace_required", message: "This Task needs a registered Project Workspace before it can be assigned." });
        } else if (affectedPathResolution.invalid.length) {
          content = JSON.stringify({
            ok: false,
            code: "affected_path_outside_workspace",
            message: "Affected paths must be relative to, or inside, the selected Worker Workspace.",
            workspace: taskWorkspace ? { id: taskWorkspace.id, name: taskWorkspace.name, path: displayTaskPath(workspaceLocalPath(taskWorkspace)) } : null,
            invalidPaths: affectedPathResolution.invalid
          }, null, 2);
        } else if (!taskAffectedPaths.length && !taskTypeAllowsNoAffectedPaths(taskType)) {
          content = JSON.stringify({ ok: false, code: "affected_paths_required", message: "Declare affected paths before creating this Task. Only the legacy design and documentation types may omit paths." });
        } else {
          const preview = await previewTaskDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, roomContext.issueId, taskAffectedPaths);
          const activeTaskIds = new Set(preview.activeTasks.map((task) => task.id));
          const unknownDependencies = blockedByIssueIds.filter((taskId) => !activeTaskIds.has(taskId));
          const missingConflictDependencies = preview.conflicts.filter((task) => !blockedByIssueIds.includes(task.id));
          if (unknownDependencies.length) {
            content = JSON.stringify({ ok: false, code: "invalid_dependency", unknownDependencies });
          } else if (missingConflictDependencies.length) {
            content = JSON.stringify({
              ok: false,
              code: "task_path_conflict",
              message: "Create the Task only after sequencing it behind every conflicting active Task.",
              conflicts: missingConflictDependencies,
              requiredBlockedByIssueIds: missingConflictDependencies.map((task) => task.id)
            }, null, 2);
          } else {
            const taskInput = {
              taskType,
              maturity,
              reviewMode: workplaneIdentityForRoomContext(roomContext).reviewMode,
              affectedPaths: taskAffectedPaths,
              designReferences,
              acceptanceCriteria,
              verification,
              blockedByIssueIds,
              assigneeAgentId,
              workerStatusAtCreation: selectedWorker.status ?? null,
              projectWorkspaceId: taskWorkspace?.id ?? null,
              projectWorkspaceName: taskWorkspace?.name ?? null
            };
            const descriptionWithContract = taskDescription({ description, ...taskInput });
            const created = await createIssueDirect(roomContext.spsApiUrl, roomContext.companyId, {
              projectId: roomContext.projectId,
              projectWorkspaceId: taskInput.projectWorkspaceId,
              parentId: roomContext.issueId,
              title,
              description: descriptionWithContract,
              status: "backlog",
              priority: "medium",
              assigneeAgentId: null,
              blockedByIssueIds,
              executionPolicy: TASK_ROOM_EXECUTION_POLICY,
              originKind: "plugin:local.room-chat:role-tool",
              originId: params.callId
            });
            const taskState = newTaskRoomState(created, roomContext, taskInput);
            try {
              await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
                issueId: created.id,
                key: TASK_ROOM_STATE_KEY,
                body: serializeState(taskState),
                companyId: roomContext.companyId,
                title: "Task Room state",
                format: "markdown",
                changeSummary: "Initialize Task Room state"
              });
              await createIssueCommentDirect(roomContext.spsApiUrl, created.id, taskProtocolComment(roomContext, created, taskState));
              const waitingForWorker = selectedWorker.status === "paused" || selectedWorker.status === "error";
              if (waitingForWorker) {
                await createIssueCommentDirect(
                  roomContext.spsApiUrl,
                  created.id,
                  `## Task waiting for assigned Worker
${selectedWorker.name} is paused before the first run. Keep this Task assigned to the same Worker. After the Worker is resumed by the Owner, start this same Task with paperclip.start_task; do not create or assign a replacement.`
                );
              }
              const activated = await updateIssueDirect(roomContext.spsApiUrl, created.id, {
                status: waitingForWorker ? "blocked" : "todo",
                assigneeAgentId,
                blockedByIssueIds
              });
              const boundaryState = await updateRoomWorkStateOutsideInvocation(
                roomContext,
                {
                  waitingFor: {
                    kind: "worker",
                    taskId: activated.id,
                    detail: waitingForWorker ? `${selectedWorker.name} must be resumed before this assigned Task can start.` : `${selectedWorker.name} is executing the assigned Task.`
                  }
                },
                `Record Worker Task boundary for ${activated.identifier || activated.id}`,
                { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
              ).catch(() => null);
              content = JSON.stringify({
                ok: true,
                task: { id: activated.id, identifier: activated.identifier, title: activated.title, status: activated.status, projectWorkspaceId: taskInput.projectWorkspaceId },
                reviewBoundary: "owning_agent",
                reviewMode: taskInput.reviewMode,
                waitingForWorker,
                worker: { id: selectedWorker.id, name: selectedWorker.name, status: selectedWorker.status },
                nextAction: waitingForWorker ? `Resume ${selectedWorker.name}, then start this same Task with paperclip.start_task.` : null,
                blockedByIssueIds,
                workStateUpdated: Boolean(boundaryState)
              }, null, 2);
            } catch (error) {
              await createIssueCommentDirect(roomContext.spsApiUrl, created.id, `## Task Room initialization blocked
${error.message}`);
              await updateIssueDirect(roomContext.spsApiUrl, created.id, { status: "blocked" });
              content = JSON.stringify({ ok: false, code: "task_room_initialization_failed", taskId: created.id, message: error.message });
            }
          }
        }
      }
    } else if (name === "paperclip.get_task_context") {
      if (!roomContext.projectId) {
        content = JSON.stringify({ ok: false, code: "missing_project" });
      } else {
        const task = await getProjectTaskDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, textParam(args, "taskId"));
        const [stateDocument, comments] = await Promise.all([
          getRoomDocumentDirect(roomContext.spsApiUrl, task.id, TASK_ROOM_STATE_KEY),
          listIssueCommentsDirect(roomContext.spsApiUrl, task.id)
        ]);
        content = JSON.stringify({
          ok: true,
          task: { id: task.id, identifier: task.identifier, title: task.title, status: task.status, assigneeAgentId: task.assigneeAgentId ?? null },
          state: parseState(stateDocument?.body),
          comments: mostRecentComments(comments, 30)
        }, null, 2);
      }
    } else if (name === "paperclip.start_task") {
      if (!roomContext.projectId) {
        content = JSON.stringify({ ok: false, code: "missing_project" });
      } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) {
        content = JSON.stringify({ ok: false, code: "agent_cannot_start_tasks" });
      } else {
        const { task, state } = await getOwnedTaskRoomDirect(roomContext, textParam(args, "taskId"));
        const dispatch = asRecord3(state.dispatch);
        const workerAgentId = textParam(state, "workerAgentId") || task.assigneeAgentId;
        const companyAgents = await listCompanyAgentsDirect(roomContext.spsApiUrl, roomContext.companyId);
        const selectedWorker = companyAgents.find((candidate) => candidate.id === workerAgentId && isTaskWorkerAgent(candidate));
        if (task.status !== "blocked" || dispatch.status !== "waiting_for_worker" || dispatch.reason !== "worker_paused_before_start") {
          content = JSON.stringify({
            ok: false,
            code: "task_not_waiting_for_worker",
            status: task.status,
            dispatchStatus: dispatch.status ?? null,
            message: "Only a blocked Task parked because its assigned Worker was paused can be started with this tool."
          });
        } else if (!selectedWorker) {
          content = JSON.stringify({ ok: false, code: "assigned_worker_missing", workerAgentId });
        } else if (selectedWorker.status === "paused") {
          content = JSON.stringify({
            ok: false,
            code: "worker_unavailable",
            worker: { id: selectedWorker.id, name: selectedWorker.name, status: selectedWorker.status },
            message: "The assigned Worker is still paused. The Owner must resume it; keep this same Task blocked."
          });
        } else {
          state.dispatch = {
            ...dispatch,
            status: "ready",
            reason: null,
            workerStatusAtStart: selectedWorker.status ?? null,
            startedAt: now(),
            updatedAt: now()
          };
          await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
            issueId: task.id,
            key: TASK_ROOM_STATE_KEY,
            body: serializeState(state),
            companyId: roomContext.companyId,
            title: "Task Room state",
            format: "markdown",
            changeSummary: "Start Task after assigned Worker resumed"
          });
          const activated = await updateIssueDirect(roomContext.spsApiUrl, task.id, {
            status: "todo",
            assigneeAgentId: selectedWorker.id,
            blockedByIssueIds: Array.isArray(state.dependencyTaskIds) ? state.dependencyTaskIds : []
          });
          await updateRoomWorkStateOutsideInvocation(
            roomContext,
            { waitingFor: { kind: "worker", taskId: activated.id, detail: `${selectedWorker.name} is executing the resumed Task.` } },
            `Record resumed Worker Task boundary for ${activated.identifier || activated.id}`,
            { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
          ).catch(() => null);
          content = JSON.stringify({
            ok: true,
            task: { id: activated.id, identifier: activated.identifier, title: activated.title, status: activated.status, assigneeAgentId: activated.assigneeAgentId ?? null },
            reusedTask: true,
            worker: { id: selectedWorker.id, name: selectedWorker.name, status: selectedWorker.status }
          }, null, 2);
        }
      }
    } else if (name === "paperclip.post_task_feedback") {
      if (!roomContext.projectId) {
        content = JSON.stringify({ ok: false, code: "missing_project" });
      } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_REVIEW)) {
        content = JSON.stringify({ ok: false, code: "agent_cannot_post_feedback" });
      } else {
        const { task, state } = await getOwnedTaskRoomDirect(roomContext, textParam(args, "taskId"));
        const message = enforceTaskContractText(textParam(args, "message"), "Task feedback");
        if (!message) {
          content = JSON.stringify({ ok: false, code: "feedback_message_required" });
        } else if (!["in_review", "blocked", "done"].includes(task.status)) {
          content = JSON.stringify({
            ok: false,
            code: "task_not_awaiting_owner_feedback",
            message: "Task feedback can restart work after the assigned Worker reports in_review or blocked, or reopen a technically completed Task after later review.",
            taskStatus: task.status
          });
        } else {
          const feedbackBody = `## ${roomContext.agentName} Feedback
${message}`;
          const previousStateBody = serializeState(state);
          const previousReview = asRecord3(state.review);
          const previousNotification = asRecord3(state.ownerNotification);
          const feedbackAt = now();
          const priorReportCommentId = textParam(previousReview, "workerReportCommentId") || textParam(previousNotification, "reportCommentId");
          const priorReportFingerprint = textParam(previousReview, "workerReportFingerprint") || textParam(previousNotification, "reportFingerprint");
          if (priorReportCommentId || priorReportFingerprint || Object.keys(previousNotification).length > 0) {
            const history = Array.isArray(state.reviewHistory) ? state.reviewHistory : [];
            state.reviewHistory = [...history, {
              outcome: "correction_requested",
              workerReportCommentId: priorReportCommentId || null,
              workerReportFingerprint: priorReportFingerprint || null,
              ownerNotificationStatus: textParam(previousNotification, "status") || null,
              ownerNotificationResultCommentId: textParam(previousNotification, "resultCommentId") || null,
              closedAt: feedbackAt
            }].slice(-20);
          }
          const previousCorrectionRound = Number(previousReview.correctionRound ?? 0);
          const correctionRound = Number.isFinite(previousCorrectionRound) ? Math.max(0, Math.trunc(previousCorrectionRound)) + 1 : 1;
          state.review = {
            required: "owning_agent",
            status: "correction_requested",
            correctionRound,
            feedbackCommentId: null,
            feedbackByAgentId: roomContext.agentId,
            feedbackByAgentName: roomContext.agentName,
            updatedAt: feedbackAt
          };
          delete state.ownerNotification;
          state.dispatch = {
            ...asRecord3(state.dispatch),
            status: "feedback_pending",
            reason: null,
            updatedAt: feedbackAt
          };
          await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
            issueId: task.id,
            key: TASK_ROOM_STATE_KEY,
            body: serializeState(state),
            companyId: roomContext.companyId,
            title: "Task Room state",
            format: "markdown",
            changeSummary: "Prepare Task correction cycle before owner feedback dispatch"
          });
          let restarted;
          try {
            restarted = await updateIssueDirect(roomContext.spsApiUrl, task.id, {
              status: "todo",
              comment: feedbackBody
            });
          } catch (error) {
            await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
              issueId: task.id,
              key: TASK_ROOM_STATE_KEY,
              body: previousStateBody,
              companyId: roomContext.companyId,
              title: "Task Room state",
              format: "markdown",
              changeSummary: "Restore Task review cycle after feedback dispatch failure"
            }).catch(() => {
            });
            throw error;
          }
          const comment = asRecord3(restarted?.comment);
          state.review.feedbackCommentId = textParam(comment, "id") || null;
          state.dispatch = {
            ...asRecord3(state.dispatch),
            status: "ready",
            feedbackRestartedAt: feedbackAt,
            updatedAt: now()
          };
          await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
            issueId: task.id,
            key: TASK_ROOM_STATE_KEY,
            body: serializeState(state),
            companyId: roomContext.companyId,
            title: "Task Room state",
            format: "markdown",
            changeSummary: "Restart Task correction cycle after owner feedback"
          });
          await updateRoomWorkStateOutsideInvocation(
            roomContext,
            { waitingFor: { kind: "worker", taskId: restarted.id, detail: "The assigned Worker is addressing owner feedback in the same Task." } },
            `Record Task correction boundary for ${restarted.identifier || restarted.id}`,
            { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
          ).catch(() => null);
          content = JSON.stringify({
            ok: true,
            task: {
              id: restarted.id,
              identifier: restarted.identifier,
              title: restarted.title,
              status: restarted.status,
              assigneeAgentId: restarted.assigneeAgentId ?? null
            },
            commentId: textParam(comment, "id") || null,
            correctionRound
          }, null, 2);
        }
      }
    } else if (name === "paperclip.complete_task") {
      if (!roomContext.projectId) {
        content = JSON.stringify({ ok: false, code: "missing_project" });
      } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_COMPLETE)) {
        content = JSON.stringify({ ok: false, code: "agent_cannot_complete_tasks" });
      } else {
        const { task, state } = await getOwnedTaskRoomDirect(roomContext, textParam(args, "taskId"));
        const reviewSummary = enforceTaskContractText(textParam(args, "reviewSummary"), "Task review summary");
        const workerReportCommentId = textParam(asRecord3(state.review), "workerReportCommentId");
        if (task.status !== "in_review") {
          content = JSON.stringify({ ok: false, code: "task_not_in_review", status: task.status, message: "Only an in_review Task can be technically verified and marked done." });
        } else if (!workerReportCommentId) {
          content = JSON.stringify({ ok: false, code: "worker_evidence_missing", message: "A substantive Worker final report must be recorded before completion." });
        } else if (!reviewSummary) {
          content = JSON.stringify({ ok: false, code: "review_summary_required" });
        } else {
          const completed = await updateIssueDirect(roomContext.spsApiUrl, task.id, { status: "done" });
          const previousReview = { ...asRecord3(state.review) };
          delete previousReview.acceptedByAgentId;
          delete previousReview.acceptedByAgentName;
          delete previousReview.acceptedAt;
          delete previousReview.summary;
          state.review = {
            ...previousReview,
            required: "owning_agent",
            status: "owner_verified",
            verifiedByAgentId: roomContext.agentId,
            verifiedByAgentName: roomContext.agentName,
            verifiedAt: now(),
            verificationSummary: reviewSummary
          };
          await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
            issueId: task.id,
            key: TASK_ROOM_STATE_KEY,
            body: serializeState(state),
            companyId: roomContext.companyId,
            title: "Task Room state",
            format: "markdown",
            changeSummary: "Record Task Owner technical verification"
          });
          const boundaryState = await updateRoomWorkStateOutsideInvocation(
            roomContext,
            {
              latestOutcome: {
                taskId: completed.id,
                identifier: completed.identifier,
                status: completed.status,
                summary: reviewSummary,
                sourceReferences: [completed.identifier || completed.id]
              },
              waitingFor: {
                kind: "user",
                taskId: completed.id,
                detail: "Technical completion has been reported in this Agent Room and is available for user review."
              }
            },
            `Record completed Task boundary for ${completed.identifier || completed.id}`,
            { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
          ).catch(() => null);
          content = JSON.stringify({
            ok: true,
            task: { id: completed.id, identifier: completed.identifier, title: completed.title, status: completed.status },
            verifiedByAgentId: roomContext.agentId,
            userApprovalGranted: false,
            workStateUpdated: Boolean(boundaryState)
          });
        }
      }
    } else {
      content = JSON.stringify({ ok: false, code: "unknown_tool", tool: name });
    }
  } catch (error) {
    content = JSON.stringify({
      ok: false,
      code: "paperclip_tool_request_failed",
      tool: name,
      message: String(error instanceof Error ? error.message : error)
    }, null, 2);
  }
  return { success: true, contentItems: [{ type: "inputText", text: content }] };
}
async function handleRoomView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const [state, workState, checkpointDocument, nativeCompactionsDocument, comments, runtime, initialJobs] = await Promise.all([
    loadRoomState(ctx, companyId, issue, agent),
    loadRoomWorkState(ctx, companyId, issue),
    ctx.issues.documents.get(issue.id, ROOM_CHECKPOINTS_KEY, companyId),
    ctx.issues.documents.get(issue.id, ROOM_NATIVE_COMPACTIONS_KEY, companyId),
    ctx.issues.listComments(issue.id, companyId),
    getRuntimeConfig(ctx),
    listRoomJobs(ctx, issue.id)
  ]);
  let jobs = initialJobs;
  const roomRuntime = agentRoomRuntime(runtime, agent);
  const pendingJobId = textParam(state.pendingTurn, "jobId");
  const pendingJob = jobs.find((job) => job.id === pendingJobId) ?? null;
  if (pendingJob && ACTIVE_ROOM_JOB_STATUSES.has(pendingJob.status) && !activeRoomMessageJobs.has(issue.id)) {
    const interrupted = await updateRoomJob(ctx, pendingJob, {
      status: "interrupted",
      completedAt: now(),
      error: "The Room worker restarted before this Job completed. The user message and Room state were preserved."
    });
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", interrupted.error);
    await saveRoomState(ctx, companyId, issue.id, state, "Mark interrupted Room Job after worker restart");
    emitRoomEvent(ctx, companyId, issue.id, { type: "interrupted", job: interrupted });
    jobs.splice(jobs.findIndex((job) => job.id === pendingJob.id), 1, interrupted);
  }
  jobs = await reconcileRoomJobLedger(ctx, issue.id, state, jobs);
  const attachments = await listIssueAttachmentsDirect(runtime.spsApiUrl, issue.id).catch((error) => {
    ctx.logger?.warn?.("Room attachment list failed.", {
      issueId: issue.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  });
  return {
    room: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role ?? null,
      projectId: issue.projectId ?? null
    },
    state,
    workState,
    checkpoints: parseState(checkpointDocument?.body) ?? [],
    nativeCompactions: Array.isArray(parseState(nativeCompactionsDocument?.body)) ? parseState(nativeCompactionsDocument.body).slice(-100) : [],
    comments: mostRecentComments(comments, 100),
    attachments: attachments.slice(-100).map(attachmentSnapshot),
    jobs: jobs.slice(-20),
    runtime: {
      enabled: roomRuntime.enabled,
      kind: roomRuntime.kind,
      model: roomRuntime.model || null,
      reasoningEffort: roomRuntime.reasoningEffort || null,
      taskAssignmentEnabled: runtime.enableTaskAssignment
    }
  };
}
async function handleCodexAccountsView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const [agents, runtime] = await Promise.all([
    ctx.agents.list({ companyId, limit: 200 }),
    getRuntimeConfig(ctx)
  ]);
  const accounts = localCodexAccounts();
  const defaultHome = runtime.codexHome || textParam(process.env, "CODEX_HOME") || path2.join(os.homedir(), ".codex");
  return {
    accounts: accounts.map(({ id, label, directoryName, home }) => ({ id, label, directoryName, home })),
    agents: agents.filter(isHiredAgent).filter((agent) => textParam(agent, "adapterType") === "codex_local").map((agent) => {
      const effectiveHome = configuredEnvironmentValue(agent, "CODEX_HOME") || defaultHome;
      const selected = accounts.find((account) => normalizeCodexHome(account.home) === normalizeCodexHome(effectiveHome));
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role ?? "general",
        model: textParam(asRecord3(agent.adapterConfig), "model", "Default") || "Default",
        selectedAccountId: selected?.id ?? null,
        effectiveHome,
        usesExplicitAccount: Boolean(configuredEnvironmentValue(agent, "CODEX_HOME"))
      };
    })
  };
}
var WORKPLANE_ROLE_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
function normalizeWorkplaneRoleId(value) {
  const roleId = textParam({ value }, "value").toLowerCase().replace(/\s+/g, "-");
  if (!WORKPLANE_ROLE_ID_RE.test(roleId)) {
    throw new Error("Workplane role ID must use lowercase letters, numbers, and hyphens and start with a letter.");
  }
  return roleId;
}
function normalizeWorkplaneMemoryAccess(value) {
  const memoryAccess = textParam({ value }, "value").toLowerCase();
  if (!(/* @__PURE__ */ new Set(["read_write", "read", "none"])).has(memoryAccess)) {
    throw new Error("Workplane memory access must be read_write, read, or none.");
  }
  return memoryAccess;
}
function normalizeWorkplaneReviewMode(value) {
  const reviewMode = textParam({ value }, "value").toLowerCase();
  if (!(/* @__PURE__ */ new Set(["automatic", "manual"])).has(reviewMode)) {
    throw new Error("Workplane review mode must be automatic or manual.");
  }
  return reviewMode;
}
function organizationAgentSummary(agent) {
  const identity = resolveAgentWorkplaneIdentity(agent);
  return {
    id: agent.id,
    urlKey: agent.urlKey ?? agent.id,
    name: agent.name,
    paperclipRole: agent.role ?? "general",
    adapterType: agent.adapterType ?? null,
    model: textParam(asRecord3(agent.adapterConfig), "model") || null,
    status: agent.status ?? null,
    workplane: identity
  };
}
async function handleOrganizationSettingsView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const agents = await ctx.agents.list({ companyId, limit: 200 });
  const hiredAgents = agents.filter(isHiredAgent);
  return {
    templates: listOrganizationTemplates().map((template) => {
      const preview = resolveOrganizationTemplate(template.id, hiredAgents);
      return {
        ...template,
        eligibleAgentCount: preview.assignments.length,
        configuredAgentCount: preview.skippedConfiguredAgentIds.length,
        unmatchedAgentCount: preview.unmatchedAgentIds.length
      };
    }).filter((template) => !template.visibleWhenEligible || template.eligibleAgentCount > 0),
    agents: hiredAgents.map(organizationAgentSummary).sort((left, right) => left.name.localeCompare(right.name))
  };
}
async function handleOrganizationAgentPolicySave(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const agentId = textParam(params, "agentId");
  const kind = textParam(params, "kind").toLowerCase();
  if (!agentId) throw new Error("agentId is required.");
  if (!(/* @__PURE__ */ new Set(["lead", "worker", "hybrid"])).has(kind)) {
    throw new Error("Workplane kind must be lead, worker, or hybrid.");
  }
  const roleId = normalizeWorkplaneRoleId(textParam(params, "roleId", kind));
  const requestedTargets = [...new Set(listParam(params, "assignableRoleIds").map(normalizeWorkplaneRoleId))];
  const assignableRoleIds = kind === "worker" ? [] : requestedTargets.length ? requestedTargets : ["worker", "hybrid"];
  const agent = await ctx.agents.get(agentId, companyId);
  if (!isHiredAgent(agent)) throw new Error("Only a hired Agent can receive a Workplane role.");
  const existingIdentity = resolveAgentWorkplaneIdentity(agent);
  const memoryAccess = normalizeWorkplaneMemoryAccess(textParam(params, "memoryAccess", existingIdentity.memoryAccess));
  const reviewMode = normalizeWorkplaneReviewMode(textParam(params, "reviewMode", existingIdentity.reviewMode));
  const adapterConfig = {
    ...asRecord3(agent.adapterConfig),
    workplane: {
      ...asRecord3(asRecord3(agent.adapterConfig).workplane),
      roleId,
      kind,
      assignableRoleIds,
      memoryAccess,
      reviewMode
    }
  };
  const runtime = await getRuntimeConfig(ctx);
  await updateAgentAdapterConfigDirect(runtime.spsApiUrl, companyId, agent.id, adapterConfig);
  const updated = { ...agent, adapterConfig };
  return {
    ok: true,
    agent: organizationAgentSummary(updated),
    nextRoomTurn: "The new Workplane role, delegation, memory, and review policies apply when this Agent starts its next Room or Task turn. Existing Task ownership and Task review mode remain unchanged."
  };
}
async function handleOrganizationSettingsAccess(_ctx, _params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  return {
    companyId,
    canConfigureAgents: Boolean(actionCtx?.actor?.permissions?.includes("agents:configure"))
  };
}
async function handleOrganizationCollaborationReadiness(_ctx, _params, actionCtx) {
  requireAgentConfigurationAction(actionCtx);
  return readCollaborationReadiness();
}
async function handleOrganizationTemplateApply(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const templateId = textParam(params, "templateId");
  if (!templateId) throw new Error("templateId is required.");
  const agents = (await ctx.agents.list({ companyId, limit: 200 })).filter(isHiredAgent);
  const preview = resolveOrganizationTemplate(templateId, agents);
  if (!preview.template.actionable) {
    throw new Error("This template is a manual starting point and cannot be applied automatically.");
  }
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const runtime = await getRuntimeConfig(ctx);
  const updated = [];
  const failures = [];
  for (const assignment of preview.assignments) {
    const agent = agentsById.get(assignment.agentId);
    if (!agent) continue;
    const adapterConfig = {
      ...asRecord3(agent.adapterConfig),
      workplane: {
        ...asRecord3(asRecord3(agent.adapterConfig).workplane),
        ...assignment.policy
      }
    };
    try {
      await updateAgentAdapterConfigDirect(runtime.spsApiUrl, companyId, agent.id, adapterConfig);
      updated.push({ id: agent.id, name: agent.name, workplane: assignment.policy });
    } catch (error) {
      failures.push({ id: agent.id, name: agent.name, error: String(error instanceof Error ? error.message : error) });
    }
  }
  return {
    ok: failures.length === 0,
    template: preview.template,
    updated,
    skippedConfiguredAgentIds: preview.skippedConfiguredAgentIds,
    unmatchedAgentIds: preview.unmatchedAgentIds,
    failures,
    nextRoomTurn: "Updated Agents use explicit generic Workplane policies from their next Room or Task turn. Existing Rooms and Tasks were not changed."
  };
}
async function handleCodexAccountSelect(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const agentId = textParam(params, "agentId");
  const accountId = textParam(params, "accountId");
  if (!agentId || !accountId) throw new Error("agentId and accountId are required.");
  const account = localCodexAccounts().find((candidate) => candidate.id === accountId);
  if (!account) throw new Error("The selected Codex account is no longer signed in on this computer. Refresh the account list and choose an available account.");
  const agent = await ctx.agents.get(agentId, companyId);
  if (!isHiredAgent(agent) || textParam(agent, "adapterType") !== "codex_local") {
    throw new Error("Only a Codex CLI Agent can be assigned a Codex account.");
  }
  const runtime = await getRuntimeConfig(ctx);
  const adapterConfig = applyCodexAccountToAdapterConfig(agent, account);
  await updateAgentAdapterConfigDirect(runtime.spsApiUrl, companyId, agent.id, adapterConfig);
  return {
    ok: true,
    agentId: agent.id,
    account: { id: account.id, label: account.label, home: account.home },
    nextRoomSession: "A Room using a different Codex account starts a new Codex CLI session on its next message. SPS Room history and checkpoints remain available."
  };
}
async function handleRoomTaskSummary(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const room = await ctx.issues.get(issueId, companyId);
  if (!isAgentRoom(room) || !room.projectId) return { room: null, tasks: [], activeTaskCount: 0, referencedFiles: [] };
  const [issues, agents] = await Promise.all([
    ctx.issues.list({ companyId, projectId: room.projectId, limit: 500 }),
    ctx.agents?.list ? ctx.agents.list({ companyId, limit: 200 }) : Promise.resolve([])
  ]);
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const tasks = issues.filter((issue) => issue.parentId === room.id && !isLongLivedRoom(issue)).map((issue) => {
    const worker = agentsById.get(issue.assigneeAgentId);
    return {
      id: issue.id,
      identifier: issue.identifier ?? issue.id,
      title: issue.title,
      status: issue.status,
      description: issue.description ?? "",
      updatedAt: issue.updatedAt ?? null,
      assigneeAgent: worker ? { id: worker.id, name: worker.name, role: worker.role ?? null } : null
    };
  }).sort(compareTasks);
  return {
    room: { id: room.id, identifier: room.identifier, title: room.title, projectId: room.projectId },
    tasks,
    activeTaskCount: tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status)).length,
    referencedFiles: taskFileReferences(tasks)
  };
}
async function handleRoomWorkspaceView(ctx, params) {
  const roomView = await handleRoomView(ctx, params);
  const taskSummary = await handleRoomTaskSummary(ctx, params);
  const companyId = textParam(params, "companyId");
  const projectId = roomView.room.projectId;
  const project = projectId ? await ctx.projects.get(projectId, companyId) : null;
  const agent = await ctx.agents.get(roomView.room.agentId, companyId);
  const resolvedWorkspace = await resolveRoomWorkspace(ctx, companyId, roomView.room, agent, roomView.state);
  const projectWorkspaces = resolvedWorkspace.workspaces;
  const selectedWorkspace = resolvedWorkspace.workspace;
  const workingDirectory = workspaceLocalPath(selectedWorkspace) || roomView.state?.workingDirectory || "";
  const workspaceSetupState = projectWorkspaces === null ? "legacy" : !projectWorkspaces.length || !selectedWorkspace ? "missing" : !workingDirectory || !fs2.existsSync(workingDirectory) ? "unavailable" : "ready";
  const workspaces = workingDirectory ? [workspaceGitChanges({
    id: roomView.room.agentId,
    name: `${roomView.room.agentName} \uC791\uC5C5 \uD3F4\uB354`,
    cwd: workingDirectory,
    metadata: { kind: workspaceKindForAgent(agent) }
  })] : [];
  return {
    ...roomView,
    project: project ? {
      id: project.id,
      name: project.name ?? project.slug ?? project.id,
      routeKey: project.urlKey ?? project.slug ?? project.id
    } : null,
    tasks: taskSummary.tasks,
    activeTaskCount: taskSummary.activeTaskCount,
    referencedFiles: taskSummary.referencedFiles,
    workspaces,
    workspaceBinding: roomView.state?.workspace ?? null,
    workspaceSetup: {
      state: workspaceSetupState,
      registeredCount: Array.isArray(projectWorkspaces) ? projectWorkspaces.length : null,
      selectedName: selectedWorkspace?.name ?? null
    },
    workspaceLinkTargets: (Array.isArray(projectWorkspaces) ? projectWorkspaces : []).map((workspace) => ({
      projectId,
      workspaceId: workspace.id,
      workspaceName: workspace.name ?? "Workspace",
      rootPath: workspaceLocalPath(workspace)
    })).filter((workspace) => workspace.projectId && workspace.workspaceId && workspace.rootPath),
    changedFileCount: workspaces.reduce((count, workspace) => count + workspace.files.length, 0)
  };
}
function workplaneIssueSummary(issue, parentRoom = null) {
  return {
    id: issue.id,
    identifier: issue.identifier ?? issue.id,
    title: issue.title,
    status: issue.status,
    parentId: issue.parentId ?? null,
    agentId: agentRoomAgentId(issue),
    agentName: isAgentRoom(issue) ? issue.title : null,
    assigneeAgentId: issue.assigneeAgentId ?? null,
    assigneeUserId: issue.assigneeUserId ?? null,
    updatedAt: issue.updatedAt ?? null,
    parentRoom: parentRoom ? {
      id: parentRoom.id,
      identifier: parentRoom.identifier ?? parentRoom.id,
      title: parentRoom.title,
      agentId: agentRoomAgentId(parentRoom),
      agentName: isAgentRoom(parentRoom) ? parentRoom.title : null
    } : null
  };
}
function compareTasks(left, right) {
  const statusDifference = (TASK_STATUS_ORDER.get(left.status) ?? 99) - (TASK_STATUS_ORDER.get(right.status) ?? 99);
  if (statusDifference !== 0) return statusDifference;
  return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
}
function projectTaskSummary(issue, project, parentRoom = null) {
  return {
    ...workplaneIssueSummary(issue, parentRoom),
    project: project ? { id: project.id, name: project.name ?? project.slug ?? project.id } : null
  };
}
async function handleProjectWorkplaneView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const projectId = textParam(params, "projectId");
  if (!companyId || !projectId) throw new Error("companyId and projectId are required.");
  const project = await ctx.projects.get(projectId, companyId);
  if (!project) throw new Error("Project was not found.");
  const provisioned = await provisionProjectAgentRooms(ctx, companyId, projectId);
  const initialIssues = await ctx.issues.list({ companyId, projectId, limit: 500 });
  const retiredLegacyRooms = await retireLegacyRoleRooms(ctx, companyId, initialIssues);
  const [issues, agents, workspaces] = await Promise.all([
    ctx.issues.list({ companyId, projectId, limit: 500 }),
    ctx.agents.list({ companyId, limit: 200 }),
    listProjectWorkspaces(ctx, companyId, projectId)
  ]);
  const workspaceProfile = await loadProjectWorkspaceProfile(ctx, projectId, workspaces);
  const hiredAgents = agents.filter(isHiredAgent);
  const agentsById = new Map(hiredAgents.map((agent) => [agent.id, agent]));
  const rooms = issues.filter((issue) => isAgentRoom(issue) && !TERMINAL_STATUSES.has(issue.status) && agentsById.has(agentRoomAgentId(issue)));
  const activeLegacyRoleRoomCount = issues.filter((issue) => isLegacyRoleRoom(issue) && !TERMINAL_STATUSES.has(issue.status)).length;
  const taskCount = issues.filter((issue) => !isLongLivedRoom(issue) && issue.projectId === projectId).length;
  return {
    project: { id: project.id, name: project.name ?? project.slug ?? projectId, routeKey: project.urlKey ?? project.slug ?? projectId },
    provisionedAgentRoomCount: provisioned.created.length,
    retiredNonHiredAgentRoomCount: provisioned.retired.length,
    retiredLegacyRoleRoomCount: retiredLegacyRooms.length,
    activeLegacyRoleRoomCount,
    rooms: rooms.map((room) => ({
      ...workplaneIssueSummary(room),
      agent: agentsById.get(agentRoomAgentId(room)) ? {
        id: agentsById.get(agentRoomAgentId(room)).id,
        name: agentsById.get(agentRoomAgentId(room)).name,
        role: agentsById.get(agentRoomAgentId(room)).role ?? null,
        status: agentsById.get(agentRoomAgentId(room)).status
      } : null
    })),
    workspaceProfile: {
      profile: workspaceProfile,
      workspaces: (Array.isArray(workspaces) ? workspaces : []).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        path: workspaceLocalPath(workspace),
        repoUrl: workspace.repoUrl ?? null,
        isPrimary: workspace.isPrimary === true
      })),
      agents: hiredAgents.map((agent) => ({ id: agent.id, name: agent.name, role: agent.role ?? null }))
    },
    taskCount
  };
}
async function handleProjectTasksView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const selectedProjectId = textParam(params, "projectId");
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  const projectSummaries = projects.map((project) => ({ id: project.id, name: project.name ?? project.slug ?? project.id }));
  if (!selectedProjectId) {
    return {
      projects: projectSummaries,
      selectedProjectId: null,
      requiresProjectSelection: true,
      tasks: []
    };
  }
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  if (!selectedProject) throw new Error("Project was not found.");
  const [issues, agents] = await Promise.all([
    ctx.issues.list({ companyId, projectId: selectedProjectId, limit: 500 }),
    ctx.agents?.list ? ctx.agents.list({ companyId, limit: 200 }) : Promise.resolve([])
  ]);
  const roomsById = new Map(issues.filter(isLongLivedRoom).map((room) => [room.id, room]));
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const tasks = issues.filter((issue) => issue.projectId === selectedProjectId && !isLongLivedRoom(issue)).map((issue) => {
    const worker = agentsById.get(issue.assigneeAgentId);
    return {
      ...projectTaskSummary(issue, selectedProject, roomsById.get(issue.parentId) ?? null),
      assigneeAgent: worker ? { id: worker.id, name: worker.name, role: worker.role ?? null } : null
    };
  }).sort(compareTasks);
  return {
    projects: projectSummaries,
    project: { id: selectedProject.id, name: selectedProject.name ?? selectedProject.slug ?? selectedProject.id },
    selectedProjectId,
    requiresProjectSelection: false,
    tasks
  };
}
async function handleTaskRoomView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const task = await ctx.issues.get(issueId, companyId);
  if (!task || !task.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const [taskStateDocument, comments, parentRoom, runtime, worker] = await Promise.all([
    ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId),
    ctx.issues.listComments(task.id, companyId),
    ctx.issues.get(task.parentId, companyId),
    getRuntimeConfig(ctx),
    task.assigneeAgentId && ctx.agents?.get ? ctx.agents.get(task.assigneeAgentId, companyId).catch(() => null) : Promise.resolve(null)
  ]);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room") {
    throw new Error("This Task has no Task Room state. Legacy Direct Task test runs do not provide collaborative Task Room state.");
  }
  return {
    task: {
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      assigneeAgentId: task.assigneeAgentId ?? null
    },
    state: taskState,
    ownerRoom: parentRoom ? { id: parentRoom.id, title: parentRoom.title } : null,
    worker: worker ? { id: worker.id, name: worker.name, role: worker.role ?? null } : null,
    comments: mostRecentComments(comments, 100),
    runtime: { enabled: runtime.enabled }
  };
}
async function handleTaskOwnerFeedback(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) {
    return { ok: false, code: "codex_rooms_disabled", message: "Enable the Codex Room runtime before requesting owner feedback." };
  }
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A feedback request is required." };
  const task = await ctx.issues.get(issueId, companyId);
  if (!task || !task.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room") throw new Error("This Task has no collaborative Task Room state.");
  if (taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, taskState.originatingRoomIssueId);
  if (taskState.owningAgentId !== agent.id) throw new Error("Task Room owner Agent does not match the originating Room.");
  if (activeRoomMessageJobs.has(ownerRoom.id) || await activeRoomJob(ctx, ownerRoom.id)) {
    return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  }
  const requestComment = await ctx.issues.createComment(task.id, `## User Request for ${agent.name} Feedback
${message}`, companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_feedback",
    sourceCommentId: requestComment.id ?? null,
    payload: { message }
  });
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: requestComment.id ?? null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id);
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist queued Task owner feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  const started = startDurableRoomJob(ctx, { companyId, runtime, job });
  if (!started) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  return { ok: true, accepted: true, taskId: task.id, ownerAgent: agent.name, jobId: job.id };
}
async function handleRoomBootstrap(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const issueId = textParam(params, "issueId");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const requestedWorkspaceId = textParam(params, "workspaceId");
  const requestedWorkingDirectory = textParam(params, "workingDirectory");
  const state = await loadRoomState(ctx, companyId, issue, agent);
  const resolved = await resolveRoomWorkspace(ctx, companyId, issue, agent, state);
  if (!Array.isArray(resolved.workspaces) || !resolved.workspaces.length) {
    return { ok: false, code: "workspace_required", message: "Add a registered Project Workspace before configuring this Room." };
  }
  const selected = requestedWorkspaceId ? resolved.workspaces.find((workspace) => workspace.id === requestedWorkspaceId) : requestedWorkingDirectory ? resolved.workspaces.find((workspace) => normalizedWorkspacePath(workspaceLocalPath(workspace)) === normalizedWorkspacePath(requestedWorkingDirectory)) : resolved.workspace;
  if (!selected) {
    return { ok: false, code: "workspace_not_found", message: "Select one of this Project's registered Workspaces. Raw folder paths are not accepted." };
  }
  state.workspace = workspaceBinding(selected);
  delete state.workingDirectory;
  state.version = 3;
  state.runtime.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Update Room Workspace binding");
  return {
    ok: true,
    state,
    workspaces: resolved.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      kind: workspaceKindForProjectWorkspace(workspace),
      isPrimary: workspace.isPrimary === true
    }))
  };
}
async function runRoomMessageInBackground(ctx, { companyId, issueId, runtime, sourceCommentId, message }) {
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (state.pendingTurn?.kind !== "room_message" || state.pendingTurn?.sourceCommentId !== sourceCommentId) return;
  let activity = null;
  try {
    const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Room Codex thread for background turn");
    activity = roomActivityReporter(ctx, companyId, issue.id, state);
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: message,
      excludedCommentId: sourceCommentId
    });
    const turn = await client.runTurn({ threadId, text: prepared.text, onProgress: activity.report });
    markCodexRoomContextHydrated(state, threadId, prepared);
    await activity.flush();
    const assistantMessage = turnResultText(turn);
    const reasoningSummary = roomReasoningSummary(state);
    if (reasoningSummary) {
      await ctx.issues.createComment(issue.id, `**${agent.name} \xB7 \uC0DD\uAC01 \uC694\uC57D**
${reasoningSummary}`, companyId);
    }
    const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**
${assistantMessage}`, companyId);
    state.runtime.updatedAt = now();
    state.lastCommentId = assistantComment.id ?? sourceCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomState(ctx, companyId, issue.id, state, "Persist completed background Room turn");
  } catch (error) {
    await activity?.flush();
    finishRoomActivity(state, "failed", error);
    await saveRoomState(ctx, companyId, issue.id, state, "Persist failed background Room turn for recovery");
    throw error;
  }
}
function startRoomMessageInBackground(ctx, input) {
  if (activeRoomMessageJobs.has(input.issueId)) return false;
  const job = queueRoom(input.issueId, () => runRoomMessageInBackground(ctx, input));
  trackActiveRoomJob(ctx, input.issueId, job, "Background Room turn failed.");
  return true;
}
async function handleRoomSend(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) {
    return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled. Configure and enable it before sending a live message." };
  }
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A Room message is required." };
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (activeRoomMessageJobs.has(issue.id)) {
    return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  }
  const userComment = await ctx.issues.createComment(issue.id, roomUserCommentBody(message, [], "agent"), companyId);
  state.pendingTurn = { kind: "room_message", sourceCommentId: userComment.id ?? null, message, startedAt: now() };
  beginRoomActivity(state, "room_message");
  await saveRoomState(ctx, companyId, issue.id, state, "Persist queued Room message before background turn");
  const started = startRoomMessageInBackground(ctx, {
    companyId,
    issueId: issue.id,
    runtime,
    sourceCommentId: userComment.id ?? null,
    message
  });
  if (!started) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  return { ok: true, accepted: true, sourceCommentId: userComment.id ?? null };
}
async function handleRoomCompact(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled." };
  const issueId = textParam(params, "issueId");
  return queueRoom(issueId, async () => {
    const { issue, agent } = await requireRoom(ctx, companyId, issueId);
    const state = await loadRoomState(ctx, companyId, issue, agent);
    const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
    state.pendingTurn = { kind: "compact_handoff", sourceCommentId: state.lastCommentId ?? null, startedAt: now() };
    await saveRoomState(ctx, companyId, issue.id, state, "Persist Room thread before compact handoff");
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const handoffTurn = await client.runTurn({
      threadId,
      text: prepared.text
    });
    markCodexRoomContextHydrated(state, threadId, prepared);
    const summary = turnResultText(handoffTurn);
    const comments = await ctx.issues.listComments(issue.id, companyId);
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary,
      sourceCommentId: mostRecentComments(comments, 1).at(-1)?.id ?? state.lastCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    state.pendingTurn = null;
    await saveRoomState(ctx, companyId, issue.id, state, "Write pre-compact Room handoff");
    await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
    let compacted = { compacted: false, checkpointOnly: true };
    if (typeof client.compactThread === "function") {
      if (threadId) manualCodexCompactionThreads.add(threadId);
      try {
        compacted = await client.compactThread(threadId);
      } finally {
        if (threadId) manualCodexCompactionThreads.delete(threadId);
      }
    }
    if (compacted.compacted === true) {
      state.checkpoint.compactedAt = now();
      await publishRoomMemoryLifecycle(ctx, companyId, issue.id, "room.compacted", state.checkpoint);
    }
    state.runtime.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record native Codex compact completion");
    return { ok: true, checkpoint: state.checkpoint, compacted: compacted.compacted };
  });
}
async function runDurableRoomMessage(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let state = null;
  let activity = null;
  let issue = null;
  let agent = null;
  try {
    ({ issue, agent } = await requireRoom(ctx, companyId, job.roomIssueId));
    state = await loadRoomState(ctx, companyId, issue, agent);
    if (state.pendingTurn?.jobId !== job.id) return;
    if (isRoomCliRuntimeAgent(agent)) {
      if (textParam(agent, "adapterType") === "codex_local" && textParam(asRecord3(job.payload), "retryRuntime") === "agy") {
        const workingDirectory2 = isWorkerOnlyRoomAgent(agent) ? workerRoomSandboxDirectory(companyId, issue, agent) : await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state);
        job = await updateRoomJob(ctx, job, { status: "working" });
        await saveRoomState(ctx, companyId, issue.id, state, "Bind Agy fallback runtime for queued Room Job");
        emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
        activity = roomActivityReporter(ctx, companyId, issue.id, state);
        const requestedAttachments2 = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
        const stagedAttachments2 = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments2, workingDirectory2);
        const fallbackSessionId = `agy-quota-retry-${job.id}`;
        const prepared3 = await prepareNativeRoomTurn(ctx, {
          companyId,
          issue,
          state,
          sessionId: fallbackSessionId,
          currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments2, textParam(job.payload, "retryOfCommentId")),
          excludedCommentId: job.sourceCommentId
        });
        const turn2 = await runAgyRoomFallback(ctx, {
          runtime,
          companyId,
          issue,
          agent,
          state,
          workingDirectory: workingDirectory2,
          preparedText: prepared3.text,
          stagedAttachments: stagedAttachments2,
          mode: effectiveRoomMessageMode(agent)
        });
        markNativeRoomContextHydrated(state, fallbackSessionId, prepared3);
        await activity.flush();
        const assistantComment3 = await ctx.issues.createComment(issue.id, `**${agent.name}**
${turnResultText(turn2)}`, companyId);
        state.runtime.updatedAt = now();
        state.runtime.lastError = null;
        state.runtime.quotaRetry = { ...asRecord3(state.runtime.quotaRetry), status: "resolved", resolvedAt: now(), resultCommentId: assistantComment3.id ?? null };
        state.lastCommentId = assistantComment3.id ?? job.sourceCommentId ?? null;
        state.pendingTurn = null;
        finishRoomActivity(state, "completed");
        await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Agy quota retry Room Job");
        job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment3.id ?? null, payload: { ...asRecord3(job.payload), quotaRetryAt: null } });
        emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
        return job;
      }
      const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
      job = await updateRoomJob(ctx, job, { status: "working" });
      await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for Room Job");
      emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
      activity = roomActivityReporter(ctx, companyId, issue.id, state);
      const requestedAttachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
      const stagedAttachments = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments, workingDirectory);
      const prepared2 = await prepareCodexRoomTurn(ctx, {
        companyId,
        issue,
        state,
        threadId,
        currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments, textParam(job.payload, "retryOfCommentId")),
        excludedCommentId: job.sourceCommentId
      });
      const started2 = await startRoomTurn(
        client,
        threadId,
        prepared2.text,
        stagedAttachments,
        agyContext,
        roomRuntime,
        effectiveRoomMessageMode(agent),
        activity
      );
      if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared2);
      state.runtime.lastError = null;
      state.runtime.activity.turnId = started2.turnId;
      state.runtime.activity.updatedAt = now();
      await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server Room run");
      const turn = roomRuntime.kind === "codex_app_server" ? await codexCompletionWithAgyFallback(ctx, {
        completion: started2.completion,
        runtime,
        companyId,
        issue,
        agent,
        state,
        workingDirectory,
        preparedText: prepared2.text,
        stagedAttachments,
        mode: effectiveRoomMessageMode(agent)
      }) : await started2.completion;
      await activity.flush();
      const assistantComment2 = await ctx.issues.createComment(issue.id, `**${agent.name}**
${turnResultText(turn)}`, companyId);
      state.runtime.updatedAt = now();
      state.runtime.lastError = null;
      state.lastCommentId = assistantComment2.id ?? job.sourceCommentId ?? null;
      state.pendingTurn = null;
      finishRoomActivity(state, "completed");
      await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Codex app-server Room Job");
      job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment2.id ?? null });
      emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
      return job;
    }
    const { session } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for Room Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    activity = nativeRoomActivityReporter(ctx, companyId, issue.id, state);
    const prepared = await prepareNativeRoomTurn(ctx, {
      companyId,
      issue,
      state,
      sessionId: session.sessionId,
      currentText: textParam(job.payload, "message"),
      excludedCommentId: job.sourceCommentId
    });
    const started = await startNativeAgentSessionTurn(ctx, {
      sessionId: session.sessionId,
      companyId,
      prompt: prepared.text,
      reason: job.kind === "task_owner_report" ? "Review a Worker Task report in the owner Room" : "Continue the long-lived Agent Room",
      onEvent: activity.report
    });
    markNativeRoomContextHydrated(state, session.sessionId, prepared);
    state.runtime.lastRunId = started.runId;
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started.runId;
    state.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record started native Agent Session run");
    const terminalEvent = await started.completion;
    await activity.flush();
    const assistantMessage = nativeSessionResultText(terminalEvent);
    const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**
${assistantMessage}`, companyId);
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.lastCommentId = assistantComment.id ?? job.sourceCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Room Job");
    job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment.id ?? null });
    emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
  } catch (error) {
    await activity?.flush();
    if (state && issue && isProviderQuotaError(error)) {
      const scheduled = await scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error });
      return scheduled.job;
    }
    if (state) {
      state.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
      state.pendingTurn = null;
      finishRoomActivity(state, "failed", error);
      await saveRoomState(ctx, companyId, job.roomIssueId, state, "Persist failed Room Job");
    }
    job = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    emitRoomEvent(ctx, companyId, job.roomIssueId, { type: "failed", job });
    throw error;
  }
  return job;
}
async function runDurableRoomCompact(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let state = null;
  let activity = null;
  let issue = null;
  let agent = null;
  try {
    ({ issue, agent } = await requireRoom(ctx, companyId, job.roomIssueId));
    state = await loadRoomState(ctx, companyId, issue, agent);
    if (state.pendingTurn?.jobId !== job.id) return;
    if (isRoomCliRuntimeAgent(agent)) {
      const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
      job = await updateRoomJob(ctx, job, { status: "working" });
      await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for checkpoint Job");
      emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
      activity = roomActivityReporter(ctx, companyId, issue.id, state);
      const prepared2 = await prepareCodexRoomTurn(ctx, {
        companyId,
        issue,
        state,
        threadId,
        currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
      });
      const started2 = await startRoomTurn(
        client,
        threadId,
        prepared2.text,
        [],
        agyContext,
        roomRuntime,
        effectiveRoomMessageMode(agent),
        activity
      );
      if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared2);
      state.runtime.lastError = null;
      state.runtime.activity.turnId = started2.turnId;
      await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server checkpoint run");
      const turn = roomRuntime.kind === "codex_app_server" ? await codexCompletionWithAgyFallback(ctx, {
        completion: started2.completion,
        runtime,
        companyId,
        issue,
        agent,
        state,
        workingDirectory,
        preparedText: prepared2.text,
        stagedAttachments: [],
        mode: effectiveRoomMessageMode(agent)
      }) : await started2.completion;
      await activity.flush();
      const checkpoint2 = {
        version: (state.checkpoint?.version ?? 0) + 1,
        summary: turnResultText(turn),
        sourceCommentId: state.lastCommentId ?? job.sourceCommentId ?? null,
        createdAt: now(),
        compactedAt: null
      };
      state.checkpoint = checkpoint2;
      await saveRoomState(ctx, companyId, issue.id, state, "Write Codex app-server Room checkpoint");
      await appendCheckpoint(ctx, companyId, issue.id, checkpoint2);
      let compacted = { compacted: false, checkpointOnly: true };
      if (turn?.fallbackFrom !== "codex" && typeof client.compactThread === "function") {
        if (threadId) manualCodexCompactionThreads.add(threadId);
        try {
          compacted = await client.compactThread(threadId);
        } finally {
          if (threadId) manualCodexCompactionThreads.delete(threadId);
        }
      }
      if (compacted.compacted === true) {
        state.checkpoint.compactedAt = now();
        await publishRoomMemoryLifecycle(ctx, companyId, issue.id, "room.compacted", state.checkpoint);
      }
      state.runtime.updatedAt = now();
      state.runtime.lastError = null;
      state.pendingTurn = null;
      finishRoomActivity(state, "completed");
      state.runtime.activity.checkpointOnly = compacted.checkpointOnly === true;
      state.runtime.activity.compacted = compacted.compacted === true;
      await saveRoomState(ctx, companyId, issue.id, state, "Record completed Codex app-server checkpoint Job");
      job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), payload: { ...job.payload, ...compacted } });
      emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, checkpoint: checkpoint2 });
      return job;
    }
    const { session } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for checkpoint Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    activity = nativeRoomActivityReporter(ctx, companyId, issue.id, state);
    const prepared = await prepareNativeRoomTurn(ctx, {
      companyId,
      issue,
      state,
      sessionId: session.sessionId,
      currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const started = await startNativeAgentSessionTurn(ctx, {
      sessionId: session.sessionId,
      companyId,
      prompt: prepared.text,
      reason: "Create a durable Room checkpoint",
      onEvent: activity.report
    });
    markNativeRoomContextHydrated(state, session.sessionId, prepared);
    state.runtime.lastRunId = started.runId;
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started.runId;
    await saveRoomState(ctx, companyId, issue.id, state, "Record started native checkpoint run");
    const terminalEvent = await started.completion;
    await activity.flush();
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: nativeSessionResultText(terminalEvent),
      sourceCommentId: state.lastCommentId ?? job.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await saveRoomState(ctx, companyId, issue.id, state, "Write native Room checkpoint");
    await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.checkpointOnly = true;
    await saveRoomState(ctx, companyId, issue.id, state, "Record completed native Room checkpoint Job");
    job = await updateRoomJob(ctx, job, {
      status: "completed",
      completedAt: now(),
      payload: { ...job.payload, compacted: false, checkpointOnly: true }
    });
    emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, checkpoint });
  } catch (error) {
    await activity?.flush();
    if (state && issue && isProviderQuotaError(error)) {
      const scheduled = await scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error });
      return scheduled.job;
    }
    if (state) {
      state.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
      state.pendingTurn = null;
      finishRoomActivity(state, "failed", error);
      await saveRoomState(ctx, companyId, job.roomIssueId, state, "Persist failed Room compact Job");
    }
    job = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    emitRoomEvent(ctx, companyId, job.roomIssueId, { type: "failed", job });
    throw error;
  }
}
async function runDurableTaskOwnerFeedback(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let ownerState = null;
  let activity = null;
  let ownerRoom = null;
  let agent = null;
  try {
    const task = await ctx.issues.get(job.taskIssueId, companyId);
    if (!task?.parentId) throw new Error("Task Room is no longer available.");
    const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
    const taskState = parseState(taskStateDocument?.body);
    if (!taskState || taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
    ({ issue: ownerRoom, agent } = await requireRoom(ctx, companyId, task.parentId));
    ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
    if (ownerState.pendingTurn?.jobId !== job.id) return;
    const comments = await ctx.issues.listComments(task.id, companyId);
    if (textParam(agent, "adapterType") === "codex_local") {
      const { client, threadId, roomRuntime, workingDirectory } = await openThread(ctx, runtime, ownerState, companyId, ownerRoom, agent);
      job = await updateRoomJob(ctx, job, { status: "working" });
      await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind Codex app-server thread for Task feedback Job");
      emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
      activity = roomActivityReporter(ctx, companyId, ownerRoom.id, ownerState);
      const feedbackPrompt2 = [
        "TASK ROOM FEEDBACK REQUEST.",
        "Respond only with concise guidance for the Worker in this Task Room.",
        "Do not create a new Task, implement work, or change Task status.",
        `Task: ${task.identifier ?? task.id} ${task.title}`,
        `Task state: ${JSON.stringify(taskState)}`,
        `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
        `User request: ${textParam(job.payload, "message")}`
      ].join("\n\n");
      const prepared2 = await prepareCodexRoomTurn(ctx, {
        companyId,
        issue: ownerRoom,
        state: ownerState,
        threadId,
        currentText: feedbackPrompt2
      });
      const started2 = await startRoomTurn(
        client,
        threadId,
        prepared2.text,
        [],
        null,
        roomRuntime,
        "agent",
        activity
      );
      markCodexRoomContextHydrated(ownerState, threadId, prepared2);
      ownerState.runtime.lastError = null;
      ownerState.runtime.activity.turnId = started2.turnId;
      ownerState.runtime.activity.updatedAt = now();
      await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started Codex app-server Task feedback run");
      const turn = await codexCompletionWithAgyFallback(ctx, {
        completion: started2.completion,
        runtime,
        companyId,
        issue: ownerRoom,
        agent,
        state: ownerState,
        workingDirectory,
        preparedText: prepared2.text,
        stagedAttachments: [],
        mode: "agent"
      });
      await activity.flush();
      const feedbackComment2 = await ctx.issues.createComment(task.id, `## ${agent.name} Feedback
${turnResultText(turn)}`, companyId);
      ownerState.runtime.updatedAt = now();
      ownerState.runtime.lastError = null;
      ownerState.lastCommentId = feedbackComment2.id ?? job.sourceCommentId ?? null;
      ownerState.pendingTurn = null;
      finishRoomActivity(ownerState, "completed");
      await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist completed Codex app-server Task feedback Job");
      job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: feedbackComment2.id ?? null });
      emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "completed", job, activity: ownerState.runtime.activity });
      return job;
    }
    const { session } = await ensureNativeRoomSession(ctx, companyId, ownerRoom, agent, ownerState);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind native Agent Session for Task feedback Job");
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
    activity = nativeRoomActivityReporter(ctx, companyId, ownerRoom.id, ownerState);
    const feedbackPrompt = [
      "TASK ROOM FEEDBACK REQUEST.",
      "Respond only with concise guidance for the Worker in this Task Room.",
      "Do not create a new Task, implement work, or change Task status.",
      `Task: ${task.identifier ?? task.id} ${task.title}`,
      `Task state: ${JSON.stringify(taskState)}`,
      `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
      `User request: ${textParam(job.payload, "message")}`
    ].join("\n\n");
    const prepared = await prepareNativeRoomTurn(ctx, {
      companyId,
      issue: ownerRoom,
      state: ownerState,
      sessionId: session.sessionId,
      currentText: feedbackPrompt
    });
    const started = await startNativeAgentSessionTurn(ctx, {
      sessionId: session.sessionId,
      companyId,
      prompt: prepared.text,
      reason: "Prepare owner feedback for a Worker Task",
      onEvent: activity.report
    });
    markNativeRoomContextHydrated(ownerState, session.sessionId, prepared);
    ownerState.runtime.lastRunId = started.runId;
    ownerState.runtime.lastError = null;
    ownerState.runtime.activity.turnId = started.runId;
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started native Task feedback run");
    const terminalEvent = await started.completion;
    await activity.flush();
    const feedbackComment = await ctx.issues.createComment(task.id, `## ${agent.name} Feedback
${nativeSessionResultText(terminalEvent)}`, companyId);
    ownerState.runtime.updatedAt = now();
    ownerState.runtime.lastRunId = terminalEvent.runId;
    ownerState.runtime.lastError = null;
    ownerState.lastCommentId = feedbackComment.id ?? job.sourceCommentId ?? null;
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist completed Task feedback Job");
    job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: feedbackComment.id ?? null });
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "completed", job, activity: ownerState.runtime.activity });
  } catch (error) {
    await activity?.flush();
    if (ownerState && ownerRoom && isProviderQuotaError(error)) {
      const scheduled = await scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue: ownerRoom, state: ownerState, error });
      return scheduled.job;
    }
    if (ownerState) {
      ownerState.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
      ownerState.pendingTurn = null;
      finishRoomActivity(ownerState, "failed", error);
      await saveRoomState(ctx, companyId, job.roomIssueId, ownerState, "Persist failed Task feedback Job");
    }
    job = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    emitRoomEvent(ctx, companyId, job.roomIssueId, { type: "failed", job });
    throw error;
  }
}
function trimRoomContext(value, limit) {
  const text4 = String(value || "").trim();
  return text4.length > limit ? text4.slice(text4.length - limit) : text4;
}
function buildAgyRoomPrompt({ agent, instructions, state, comments = [], text: text4, stagedAttachments = [], mode = "agent" }) {
  const recentComments = comments.slice(-18).map((comment) => trimRoomContext(comment?.body, 1400)).filter(Boolean).join("\n\n---\n\n");
  const checkpoint = trimRoomContext(state?.checkpoint?.summary, 5e3);
  const files = stagedAttachments.length ? stagedAttachments.map((attachment) => `- ${roomAttachmentName(attachment)}: ${attachment.localPath}`).join("\n") : "None";
  const identity = resolveAgentWorkplaneIdentity(agent);
  const kindLabel = identity.kind === "unconfigured" ? "Agent" : identity.kind;
  return [
    `You are ${agent.name}, a ${agent.role || "general"} ${kindLabel} in a long-lived SPS project Room.`,
    "Follow the role instructions below. Respond to the current request only. Do not claim SPS Task creation or status changes unless the user can verify them in SPS.",
    roomWorkplaneBoundary(agent),
    `ROLE INSTRUCTIONS:
${trimRoomContext(instructions, 12e3) || "No additional role instructions were supplied."}`,
    `DURABLE ROOM CHECKPOINT:
${checkpoint || "No checkpoint exists yet."}`,
    `RECENT ROOM CONVERSATION:
${trimRoomContext(recentComments, 16e3) || "No earlier Room messages."}`,
    `ATTACHED LOCAL FILES:
${files}`,
    `RUN MODE:
${roomMessageModeLabel(mode)}
${roomModeInstruction(mode)}`,
    `CURRENT REQUEST:
${text4}`
  ].join("\n\n");
}
async function startRoomTurn(client, threadId, text4, stagedAttachments = [], agyContext = null, roomRuntime = null, mode = "agent", activityReporter = null) {
  const selectedMode = roomMessageMode(mode);
  if (client?.kind === "agy_print") {
    if (!agyContext) throw new Error("Agy Room context is missing.");
    return client.startTurn({
      prompt: buildAgyRoomPrompt({ ...agyContext, text: text4, stagedAttachments, mode: selectedMode })
    });
  }
  const threadContext = activeThreadContexts.get(threadId);
  if (threadContext) threadContext.mode = selectedMode;
  const input = [
    { type: "text", text: `${roomModeInstruction(selectedMode)}

${text4}` },
    ...stagedAttachments.filter((attachment) => attachment.isImage).map((attachment) => ({ type: "localImage", path: attachment.localPath, detail: "auto" }))
  ];
  const turnRequest = {
    threadId,
    input,
    onProgress: activityReporter?.report,
    approvalPolicy: roomRuntime?.approvalPolicy || "never",
    sandboxPolicy: codexTurnSandboxPolicy(roomModeSandbox(roomRuntime, selectedMode)),
    ...roomRuntime?.reasoningEffort ? { effort: roomRuntime.reasoningEffort } : {},
    summary: "auto"
  };
  if (typeof client.startTurn === "function") return await client.startTurn(turnRequest);
  const started = await client.request("turn/start", turnRequest);
  const turnId = started?.turn?.id;
  if (!turnId) throw new Error("Codex app-server did not return a turn id.");
  return { turnId, completion: client.waitForTurn(threadId, turnId) };
}
async function completeRoomTurnOutsideInvocation({
  apiUrl,
  issueId,
  agentName,
  state,
  completion,
  activityReporter = null,
  resultVisibilityResolver = null,
  onProviderQuota = null
}) {
  try {
    const turn = await completion;
    const assistantMessage = turnResultText(turn);
    const visibility = resultVisibilityResolver ? await resultVisibilityResolver({ assistantMessage, turn }) : { publish: true };
    const publishResult = visibility?.publish !== false;
    const visibleAssistantMessage = typeof visibility?.transformAssistantMessage === "function" ? visibility.transformAssistantMessage(assistantMessage) : assistantMessage;
    const assistantComment = publishResult ? await createRoomCommentOutsideInvocation(apiUrl, issueId, `**${agentName}**
${visibleAssistantMessage}`) : null;
    state.runtime.updatedAt = now();
    state.lastCommentId = assistantComment?.id ?? state.lastCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.resultCommentId = assistantComment?.id ?? null;
    state.runtime.activity.resultSuppressed = !publishResult;
    state.runtime.activity.suppressionReason = !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null;
    await activityReporter?.flush();
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist completed Room turn");
    return {
      ok: true,
      resultCommentId: assistantComment?.id ?? null,
      suppressed: !publishResult,
      suppressionReason: !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null
    };
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed Room turn");
    } catch {
    }
    return { ok: false, error: message };
  }
}
async function completeRoomCompactOutsideInvocation({ apiUrl, issueId, state, completion, client, threadId, activityReporter = null, onProviderQuota = null }) {
  try {
    const turn = await completion;
    await activityReporter?.flush();
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: turnResultText(turn),
      sourceCommentId: state.lastCommentId ?? state.pendingTurn?.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint);
    let compacted = { compacted: false, checkpointOnly: true };
    if (turn?.fallbackFrom !== "codex" && typeof client.compactThread === "function") {
      if (threadId) manualCodexCompactionThreads.add(threadId);
      try {
        compacted = await client.compactThread(threadId);
      } finally {
        if (threadId) manualCodexCompactionThreads.delete(threadId);
      }
    }
    if (compacted.compacted === true) state.checkpoint.compactedAt = now();
    state.runtime.updatedAt = now();
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.compacted = compacted.compacted === true;
    state.runtime.activity.checkpointOnly = compacted.checkpointOnly === true;
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Record completed Room compact");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed Room compact");
    } catch {
    }
  }
}
async function completeTaskOwnerFeedbackOutsideInvocation({ apiUrl, taskIssueId, ownerRoomIssueId, agentName, ownerState, completion, activityReporter = null, onProviderQuota = null }) {
  try {
    const turn = await completion;
    await activityReporter?.flush();
    const feedbackComment = await createRoomCommentOutsideInvocation(apiUrl, taskIssueId, `## ${agentName} Feedback
${turnResultText(turn)}`);
    ownerState.runtime.updatedAt = now();
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    ownerState.runtime.activity.resultCommentId = feedbackComment.id ?? null;
    await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist completed Task feedback");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist failed Task feedback");
    } catch {
    }
  }
}
async function completeNativeRoomTurnOutsideInvocation({
  apiUrl,
  issueId,
  agentName,
  state,
  completion,
  activityReporter,
  resultVisibilityResolver = null,
  onProviderQuota = null
}) {
  try {
    const terminalEvent = await completion;
    await activityReporter?.flush();
    const assistantMessage = nativeSessionResultText(terminalEvent);
    const visibility = resultVisibilityResolver ? await resultVisibilityResolver({ assistantMessage, terminalEvent }) : { publish: true };
    const publishResult = visibility?.publish !== false;
    const visibleAssistantMessage = typeof visibility?.transformAssistantMessage === "function" ? visibility.transformAssistantMessage(assistantMessage) : assistantMessage;
    const assistantComment = publishResult ? await createRoomCommentOutsideInvocation(apiUrl, issueId, `**${agentName}**
${visibleAssistantMessage}`) : null;
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.lastCommentId = assistantComment?.id ?? state.lastCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.resultCommentId = assistantComment?.id ?? null;
    state.runtime.activity.resultSuppressed = !publishResult;
    state.runtime.activity.suppressionReason = !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null;
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist completed native Agent Session turn");
    return {
      ok: true,
      resultCommentId: assistantComment?.id ?? null,
      suppressed: !publishResult,
      suppressionReason: !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null
    };
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    state.runtime.updatedAt = now();
    state.runtime.lastError = message;
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed native Agent Session turn");
    } catch {
    }
    return { ok: false, error: message };
  }
}
async function completeNativeRoomCheckpointOutsideInvocation({ apiUrl, issueId, state, completion, activityReporter, onProviderQuota = null }) {
  try {
    const terminalEvent = await completion;
    await activityReporter?.flush();
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: nativeSessionResultText(terminalEvent),
      sourceCommentId: state.lastCommentId ?? state.pendingTurn?.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint);
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.checkpointOnly = true;
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist native Agent Session checkpoint");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    state.runtime.updatedAt = now();
    state.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed native Agent Session checkpoint");
    } catch {
    }
  }
}
async function completeNativeTaskOwnerFeedbackOutsideInvocation({ apiUrl, taskIssueId, ownerRoomIssueId, agentName, ownerState, completion, activityReporter, onProviderQuota = null }) {
  try {
    const terminalEvent = await completion;
    await activityReporter?.flush();
    const feedbackComment = await createRoomCommentOutsideInvocation(
      apiUrl,
      taskIssueId,
      `## ${agentName} Feedback
${nativeSessionResultText(terminalEvent)}`
    );
    ownerState.runtime.updatedAt = now();
    ownerState.runtime.lastRunId = terminalEvent.runId;
    ownerState.runtime.lastError = null;
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    ownerState.runtime.activity.resultCommentId = feedbackComment.id ?? null;
    await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist completed native Task feedback");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    ownerState.runtime.updatedAt = now();
    ownerState.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist failed native Task feedback");
    } catch {
    }
  }
}
async function launchRoomMessageWithinAction(ctx, {
  companyId,
  runtime,
  job: initialJob,
  issue,
  agent,
  state,
  completionObserver = null,
  resultVisibilityResolver = null
}) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  if (isRoomCliRuntimeAgent(agent)) {
    const { client, threadId, roomRuntime, workingDirectory: workingDirectory2, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
    const activityReporter2 = roomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for Room Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    const requestedAttachments2 = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
    const stagedAttachments2 = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments2, workingDirectory2);
    const prepared2 = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments2, textParam(job.payload, "retryOfCommentId")),
      excludedCommentId: job.sourceCommentId
    });
    const started2 = await startRoomTurn(
      client,
      threadId,
      prepared2.text,
      stagedAttachments2,
      agyContext,
      roomRuntime,
      effectiveRoomMessageMode(agent),
      activityReporter2
    );
    if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared2);
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started2.turnId;
    state.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server Room run");
    const resilientCompletion = roomRuntime.kind === "codex_app_server" ? codexCompletionWithAgyFallback(ctx, {
      completion: started2.completion,
      runtime,
      companyId,
      issue,
      agent,
      state,
      workingDirectory: workingDirectory2,
      preparedText: prepared2.text,
      stagedAttachments: stagedAttachments2,
      mode: effectiveRoomMessageMode(agent)
    }) : started2.completion;
    const baseCompletion2 = completeRoomTurnOutsideInvocation({
      apiUrl: runtime.spsApiUrl,
      issueId: issue.id,
      agentName: agent.name,
      state,
      completion: resilientCompletion,
      activityReporter: activityReporter2,
      resultVisibilityResolver,
      onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
    });
    const completion2 = baseCompletion2.then(async (result) => {
      if (completionObserver && !result?.retryScheduled) await completionObserver(result);
      return result;
    });
    trackActiveRoomJob(ctx, issue.id, completion2);
    return { ...job, completion: completion2 };
  }
  const { session, workingDirectory } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
  const activityReporter = nativeRoomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for Room Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  const requestedAttachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
  const stagedAttachments = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments, workingDirectory);
  const retryOfCommentId = textParam(job.payload, "retryOfCommentId");
  const prepared = await prepareNativeRoomTurn(ctx, {
    companyId,
    issue,
    state,
    sessionId: session.sessionId,
    currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments, retryOfCommentId),
    excludedCommentId: job.sourceCommentId
  });
  const started = await startNativeAgentSessionTurn(ctx, {
    sessionId: session.sessionId,
    companyId,
    prompt: prepared.text,
    reason: job.kind === "task_owner_report" ? "Review a Worker Task report in the owner Room" : "Continue the long-lived Agent Room",
    onEvent: activityReporter.report
  });
  markNativeRoomContextHydrated(state, session.sessionId, prepared);
  state.runtime.lastRunId = started.runId;
  state.runtime.lastError = null;
  state.runtime.activity.turnId = started.runId;
  state.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Record started native Agent Session run");
  const baseCompletion = completeNativeRoomTurnOutsideInvocation({
    apiUrl: runtime.spsApiUrl,
    issueId: issue.id,
    agentName: agent.name,
    state,
    completion: started.completion,
    activityReporter,
    resultVisibilityResolver,
    onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
  });
  const completion = baseCompletion.then(async (result) => {
    if (completionObserver && !result?.retryScheduled) await completionObserver(result);
    return result;
  });
  trackActiveRoomJob(ctx, issue.id, completion);
  return { ...job, completion };
}
async function launchRoomCompactWithinAction(ctx, { companyId, runtime, job: initialJob, issue, agent, state }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  if (isRoomCliRuntimeAgent(agent)) {
    const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
    const activityReporter2 = roomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for checkpoint Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    const prepared2 = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const started2 = await startRoomTurn(
      client,
      threadId,
      prepared2.text,
      [],
      agyContext,
      roomRuntime,
      effectiveRoomMessageMode(agent),
      activityReporter2
    );
    if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared2);
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started2.turnId;
    state.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server checkpoint run");
    const resilientCompletion = roomRuntime.kind === "codex_app_server" ? codexCompletionWithAgyFallback(ctx, {
      completion: started2.completion,
      runtime,
      companyId,
      issue,
      agent,
      state,
      workingDirectory,
      preparedText: prepared2.text,
      stagedAttachments: [],
      mode: effectiveRoomMessageMode(agent)
    }) : started2.completion;
    const completion2 = completeRoomCompactOutsideInvocation({
      apiUrl: runtime.spsApiUrl,
      issueId: issue.id,
      state,
      completion: resilientCompletion,
      client,
      threadId,
      activityReporter: activityReporter2,
      onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
    });
    trackActiveRoomJob(ctx, issue.id, completion2);
    return job;
  }
  const { session } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
  const activityReporter = nativeRoomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for checkpoint Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  const prepared = await prepareNativeRoomTurn(ctx, {
    companyId,
    issue,
    state,
    sessionId: session.sessionId,
    currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
  });
  const started = await startNativeAgentSessionTurn(ctx, {
    sessionId: session.sessionId,
    companyId,
    prompt: prepared.text,
    reason: "Create a durable Room checkpoint",
    onEvent: activityReporter.report
  });
  markNativeRoomContextHydrated(state, session.sessionId, prepared);
  state.runtime.lastRunId = started.runId;
  state.runtime.lastError = null;
  state.runtime.activity.turnId = started.runId;
  state.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Record started native checkpoint run");
  const completion = completeNativeRoomCheckpointOutsideInvocation({
    apiUrl: runtime.spsApiUrl,
    issueId: issue.id,
    state,
    completion: started.completion,
    activityReporter,
    onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
  });
  trackActiveRoomJob(ctx, issue.id, completion);
  return job;
}
async function launchTaskOwnerFeedbackWithinAction(ctx, { companyId, runtime, job: initialJob, task, taskState, comments, ownerRoom, agent, ownerState }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  if (textParam(agent, "adapterType") === "codex_local") {
    const { client, threadId, roomRuntime, workingDirectory } = await openThread(ctx, runtime, ownerState, companyId, ownerRoom, agent);
    const activityReporter2 = roomActivityReporterOutsideInvocation(runtime.spsApiUrl, ownerRoom.id, ownerState);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind Codex app-server thread for Task feedback Job");
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
    const feedbackPrompt2 = [
      "TASK ROOM FEEDBACK REQUEST.",
      "Respond only with concise guidance for the Worker in this Task Room.",
      "Do not create a new Task, implement work, or change Task status.",
      `Task: ${task.identifier ?? task.id} ${task.title}`,
      `Task state: ${JSON.stringify(taskState)}`,
      `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
      `User request: ${textParam(job.payload, "message")}`
    ].join("\n\n");
    const prepared2 = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue: ownerRoom,
      state: ownerState,
      threadId,
      currentText: feedbackPrompt2
    });
    const started2 = await startRoomTurn(
      client,
      threadId,
      prepared2.text,
      [],
      null,
      roomRuntime,
      "agent",
      activityReporter2
    );
    markCodexRoomContextHydrated(ownerState, threadId, prepared2);
    ownerState.runtime.lastError = null;
    ownerState.runtime.activity.turnId = started2.turnId;
    ownerState.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started Codex app-server Task feedback run");
    const resilientCompletion = codexCompletionWithAgyFallback(ctx, {
      completion: started2.completion,
      runtime,
      companyId,
      issue: ownerRoom,
      agent,
      state: ownerState,
      workingDirectory,
      preparedText: prepared2.text,
      stagedAttachments: [],
      mode: "agent"
    });
    const completion2 = completeTaskOwnerFeedbackOutsideInvocation({
      apiUrl: runtime.spsApiUrl,
      taskIssueId: task.id,
      ownerRoomIssueId: ownerRoom.id,
      agentName: agent.name,
      ownerState,
      completion: resilientCompletion,
      activityReporter: activityReporter2,
      onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue: ownerRoom, state: ownerState, error })
    });
    trackActiveRoomJob(ctx, ownerRoom.id, completion2);
    return job;
  }
  const { session } = await ensureNativeRoomSession(ctx, companyId, ownerRoom, agent, ownerState);
  const activityReporter = nativeRoomActivityReporterOutsideInvocation(runtime.spsApiUrl, ownerRoom.id, ownerState);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind native Agent Session for Task feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  const feedbackPrompt = [
    "TASK ROOM FEEDBACK REQUEST.",
    "Respond only with concise guidance for the Worker in this Task Room.",
    "Do not create a new Task, implement work, or change Task status.",
    `Task: ${task.identifier ?? task.id} ${task.title}`,
    `Task state: ${JSON.stringify(taskState)}`,
    `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
    `User request: ${textParam(job.payload, "message")}`
  ].join("\n\n");
  const prepared = await prepareNativeRoomTurn(ctx, {
    companyId,
    issue: ownerRoom,
    state: ownerState,
    sessionId: session.sessionId,
    currentText: feedbackPrompt
  });
  const started = await startNativeAgentSessionTurn(ctx, {
    sessionId: session.sessionId,
    companyId,
    prompt: prepared.text,
    reason: "Prepare owner feedback for a Worker Task",
    onEvent: activityReporter.report
  });
  markNativeRoomContextHydrated(ownerState, session.sessionId, prepared);
  ownerState.runtime.lastRunId = started.runId;
  ownerState.runtime.lastError = null;
  ownerState.runtime.activity.turnId = started.runId;
  ownerState.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started native Task feedback run");
  const completion = completeNativeTaskOwnerFeedbackOutsideInvocation({
    apiUrl: runtime.spsApiUrl,
    taskIssueId: task.id,
    ownerRoomIssueId: ownerRoom.id,
    agentName: agent.name,
    ownerState,
    completion: started.completion,
    activityReporter,
    onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue: ownerRoom, state: ownerState, error })
  });
  trackActiveRoomJob(ctx, ownerRoom.id, completion);
  return job;
}
function startDurableRoomJob(ctx, input) {
  const issueId = input.job.roomIssueId;
  if (activeRoomMessageJobs.has(issueId)) return false;
  const runner = ["room_message", "task_owner_report"].includes(input.job.kind) ? runDurableRoomMessage : input.job.kind === "compact_handoff" ? runDurableRoomCompact : runDurableTaskOwnerFeedback;
  const promise = queueRoom(issueId, () => runner(ctx, input));
  trackActiveRoomJob(ctx, issueId, promise);
  return true;
}
async function handleRoomSendJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  const attachmentIds = attachmentIdsParam(params);
  const retryOfCommentId = textParam(params, "retryOfCommentId");
  if (!message && !attachmentIds.length) return { ok: false, code: "message_required", message: "Write a message or attach at least one file." };
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const validatedRetryOfCommentId = await validateRoomRetrySource(ctx, companyId, issue.id, retryOfCommentId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (await roomHasActiveWork(ctx, issue.id, state)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const attachments = await resolveRoomAttachments(runtime.spsApiUrl, issue.id, attachmentIds);
  const userComment = await ctx.issues.createComment(issue.id, roomUserCommentBody(message, attachments, "agent", validatedRetryOfCommentId), companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: issue.id,
    kind: "room_message",
    sourceCommentId: userComment.id ?? null,
    payload: { message, attachments, ...validatedRetryOfCommentId ? { retryOfCommentId: validatedRetryOfCommentId } : {} }
  });
  state.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: userComment.id ?? null, startedAt: now() };
  beginRoomActivity(state, job.kind, job.id, userComment.id ?? null);
  await saveRoomState(ctx, companyId, issue.id, state, "Persist queued Room message Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  try {
    await launchRoomMessageWithinAction(ctx, { companyId, runtime, job, issue, agent, state });
    return { ok: true, accepted: true, sourceCommentId: userComment.id ?? null, jobId: job.id };
  } catch (error) {
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    await saveRoomState(ctx, companyId, issue.id, state, "Persist failed Room launch");
    await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    throw error;
  }
}
async function handleRoomCompactJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  const issueId = textParam(params, "issueId");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (await roomHasActiveWork(ctx, issue.id, state)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: issue.id,
    kind: "compact_handoff",
    sourceCommentId: state.lastCommentId ?? null,
    payload: {}
  });
  state.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: job.sourceCommentId, startedAt: now() };
  beginRoomActivity(state, job.kind, job.id);
  await saveRoomState(ctx, companyId, issue.id, state, "Persist queued Room compact Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  try {
    await launchRoomCompactWithinAction(ctx, { companyId, runtime, job, issue, agent, state });
    return { ok: true, accepted: true, jobId: job.id };
  } catch (error) {
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    await saveRoomState(ctx, companyId, issue.id, state, "Persist failed Room compact launch");
    await updateRoomJob(ctx, job, { status: "failed", completedAt: now(), error: String(error instanceof Error ? error.message : error).slice(0, 500) });
    throw error;
  }
}
async function handleTaskOwnerFeedbackJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  const taskId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A feedback request is required." };
  const task = await ctx.issues.get(taskId, companyId);
  if (!task?.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, task.parentId);
  if (taskState.owningAgentId !== agent.id) throw new Error("Task Room owner Agent does not match the originating Room.");
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  if (await roomHasActiveWork(ctx, ownerRoom.id, ownerState)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const requestComment = await ctx.issues.createComment(task.id, `## User Request for ${agent.name} Feedback
${message}`, companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_feedback",
    sourceCommentId: requestComment.id ?? null,
    payload: { message }
  });
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: requestComment.id ?? null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id);
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist queued Task feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  const comments = await ctx.issues.listComments(task.id, companyId);
  try {
    await launchTaskOwnerFeedbackWithinAction(ctx, { companyId, runtime, job, task, taskState, comments, ownerRoom, agent, ownerState });
    return { ok: true, accepted: true, taskId: task.id, ownerAgent: agent.name, jobId: job.id };
  } catch (error) {
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist failed Task feedback launch");
    await updateRoomJob(ctx, job, { status: "failed", completedAt: now(), error: String(error instanceof Error ? error.message : error).slice(0, 500) });
    throw error;
  }
}
function taskStatusTransition(event) {
  const payload = asRecord3(event?.payload);
  const patch = asRecord3(payload.patch);
  return {
    previousStatus: textParam(asRecord3(payload._previous), "status"),
    nextStatus: textParam(payload, "status") || textParam(patch, "status")
  };
}
var TASK_BOUNDARY_REPORT_MIN_CHARS = 220;
function taskReportFingerprint(body) {
  const text4 = String(body || "").replace(/\s+/g, " ").trim();
  let hash = 2166136261;
  for (let index = 0; index < text4.length; index += 1) {
    hash ^= text4.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text4.length}:${(hash >>> 0).toString(16)}`;
}
function taskCommentAgentId(comment) {
  return textParam(comment, "authorAgentId") || textParam(comment, "derivedAuthorAgentId");
}
function taskBoundaryReportKind(body) {
  const text4 = String(body || "").trim();
  if (!text4) return null;
  const heading = text4.match(/^\s*##\s*SPS\s+(Blocker|Final)\s+Report\b/im)?.[1]?.toLowerCase();
  if (heading === "blocker") return "blocked";
  if (heading === "final") return "in_review";
  const bracketed = text4.match(/\[\s*(?:SPS\s+)?(Blocker|Final)\s+Report\s*\]\s*$/im)?.[1]?.toLowerCase();
  if (bracketed === "blocker") return "blocked";
  if (bracketed === "final") return "in_review";
  return null;
}
function isSubstantiveTaskBoundaryReport(body, kind) {
  const text4 = String(body || "").trim();
  if (text4.length < TASK_BOUNDARY_REPORT_MIN_CHARS) return false;
  if (kind === "blocked") {
    return /(?:blocker|blocked|permission|quota|dependency|권한|한도|의존|차단|중단)/iu.test(text4) && /(?:impact|next|needed|영향|필요|다음|요청)/iu.test(text4);
  }
  const utf8EvidenceGroups = [
    /(?:changed\s+(?:files|paths)|outputs?|affected\s+paths?|implementation\s+paths?|files?\s+changed|변경\s*(?:파일|경로|요약|사항)|산출물|수행\s*내용|구현\s*경로)/iu,
    /(?:verification|validation|tests?|build|passed|failed|return\s+code|검증|테스트|빌드|통과|실패|확인)/iu,
    /(?:risk|reviewer|next|remaining|unverified|미검증|위험|검토자|다음|남은)/iu
  ];
  return utf8EvidenceGroups.filter((pattern) => pattern.test(text4)).length >= 2;
}
function taskReportBelongsToCurrentReviewCycle(comment, comments, taskState) {
  const review = asRecord3(taskState?.review);
  const correctionHistory = (Array.isArray(taskState?.reviewHistory) ? taskState.reviewHistory : []).map(asRecord3).filter((entry) => textParam(entry, "outcome") === "correction_requested");
  const feedbackCommentId = textParam(review, "feedbackCommentId");
  const hasCorrectionBoundary = textParam(review, "status") === "correction_requested" || Boolean(feedbackCommentId) || correctionHistory.length > 0;
  if (!hasCorrectionBoundary) return true;
  const feedbackComment = feedbackCommentId ? mostRecentComments(comments, Number.MAX_SAFE_INTEGER).find((candidate) => candidate?.id === feedbackCommentId) : null;
  const cutoffCandidates = [
    feedbackComment?.createdAt,
    textParam(review, "status") === "correction_requested" ? review.updatedAt : null,
    ...correctionHistory.map((entry) => entry.closedAt)
  ].map((value) => Date.parse(String(value || ""))).filter(Number.isFinite);
  if (!cutoffCandidates.length) return false;
  const reportCreatedAt = Date.parse(String(comment?.createdAt || ""));
  return Number.isFinite(reportCreatedAt) && reportCreatedAt > Math.max(...cutoffCandidates);
}
function latestTaskBoundaryReport(comments, taskState, expectedKind = null) {
  const workerAgentId = textParam(taskState, "workerAgentId");
  return mostRecentComments(comments, 100).slice().reverse().map((comment) => ({
    comment,
    kind: taskBoundaryReportKind(comment?.body),
    authorAgentId: taskCommentAgentId(comment),
    fingerprint: taskReportFingerprint(comment?.body)
  })).find(({ comment, kind, authorAgentId }) => kind && (!expectedKind || kind === expectedKind) && authorAgentId === workerAgentId && taskReportBelongsToCurrentReviewCycle(comment, comments, taskState) && isSubstantiveTaskBoundaryReport(comment?.body, kind)) ?? null;
}
function taskBoundaryAlreadyReported(taskState, report) {
  const review = asRecord3(taskState?.review);
  const notification = asRecord3(taskState?.ownerNotification);
  const priorReportId = textParam(notification, "reportCommentId") || textParam(review, "workerReportCommentId");
  const priorFingerprint = textParam(notification, "reportFingerprint") || textParam(review, "workerReportFingerprint");
  const notificationStatus = textParam(notification, "status");
  const manualReportPosted = notificationStatus === "manual_pending" && Boolean(textParam(notification, "roomReportCommentId"));
  return (["working", "completed"].includes(notificationStatus) || manualReportPosted) && (priorReportId === report.comment.id || priorFingerprint && priorFingerprint === report.fingerprint);
}
async function recordManualTaskOwnerReview(ctx, { companyId, eventId, task, taskState, ownerRoom, report }) {
  if (taskBoundaryAlreadyReported(taskState, report)) {
    return { skipped: true, reason: "duplicate_worker_report" };
  }
  const blocked = task.status === "blocked";
  taskState.review ??= {};
  taskState.review.mode = "manual";
  taskState.review.status = blocked ? "blocked_reported" : "owner_review_pending";
  taskState.review.workerReportCommentId = report.comment.id;
  taskState.review.workerReportFingerprint = report.fingerprint;
  taskState.review.updatedAt = now();
  taskState.ownerNotification = {
    eventId,
    status: "manual_pending",
    taskStatus: task.status,
    reportCommentId: report.comment.id,
    reportFingerprint: report.fingerprint,
    roomReportCommentId: null,
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Record manual Task owner review boundary"
  });
  const ownerComment = await ctx.issues.createComment(
    ownerRoom.id,
    [
      "**Worker Task report awaiting manual Lead review**",
      `${task.identifier ?? task.id} is ${task.status}. The assigned Worker posted its substantive ${blocked ? "blocker" : "final"} report in the Task Room.`,
      "This review policy does not wake the Lead automatically. Start the next Lead Room turn when you want technical review, feedback, or completion. This is not a user approval request."
    ].join("\n\n"),
    companyId
  );
  taskState.ownerNotification.roomReportCommentId = ownerComment?.id ?? null;
  taskState.ownerNotification.updatedAt = now();
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Publish manual Task owner review notice"
  });
  return { ok: true, taskId: task.id, ownerRoomIssueId: ownerRoom.id };
}
function taskOwnerReportPrompt(task, taskState, comments) {
  const recentComments = mostRecentComments(comments, 16).map((comment) => trimRoomContext(comment?.body, 1800)).filter(Boolean).join("\n\n---\n\n");
  const blocked = task.status === "blocked";
  return [
    "AUTOMATIC TASK OWNER REPORT.",
    "A Worker Task owned by this long-lived Agent Room has reached a review boundary.",
    "Review the Task result as the originating owning Agent. reportsTo does not affect this ownership. Do not perform the Worker's production work yourself.",
    blocked ? "The Task is blocked. Explain the exact blocker, its impact, and the smallest user decision or environment change needed. Do not retry or mark it done." : "The Task is in_review. Check the reported outputs and actual verification against every acceptance criterion. If all criteria are satisfied, call paperclip.complete_task and then report that the Task was technically verified and marked done. If anything is missing, call paperclip.post_task_feedback with exact corrections and do not mark it done. A correction turn is internal to the Task Room and will not be published as a user-facing Room report.",
    "Task Owner verification is a technical completion decision, never user, product, design, cost, release, or publication approval. Never say that you approved or accepted the work on the user's behalf. Use completion language such as '\uC218\uB77D \uAE30\uC900 \uCDA9\uC871\uC744 \uD655\uC778\uD574 \uC644\uB8CC \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4' and include explicit user review items.",
    "Do not create request_confirmation, ask_user_questions, approvals, or any other Task interaction. A Task never asks the user for approval. Keep every user-facing report, question, blocker, and result in this Agent Room. The user may review or reopen a completed Task later.",
    "Before the user-facing Room report, update the durable Room Work State if this result changes the latest outcome, phase, next candidate, source pointers, or waiting boundary. Derive a next candidate from approved repository plans when one is uniquely supported; otherwise record no candidate and ask one focused Room question. Never invent the next step from Task titles alone.",
    `Task: ${task.identifier ?? task.id} ${task.title}`,
    `Task status: ${task.status}`,
    `Task description:
${trimRoomContext(task.description, 12e3) || "No description."}`,
    `Task Room state:
${trimRoomContext(JSON.stringify(taskState), 6e3)}`,
    `Recent Task Room comments:
${trimRoomContext(recentComments, 16e3) || "No Worker report comment was found."}`
  ].join("\n\n");
}
async function latestTaskRoomStateOutsideInvocation(apiUrl, task, fallback) {
  const document = await getRoomDocumentDirect(apiUrl, task.id, TASK_ROOM_STATE_KEY);
  const current = parseState(document?.body);
  if (current?.kind === "task_room" && current.taskIssueId === task.id && current.originatingRoomIssueId === task.parentId) return current;
  return fallback;
}
async function taskOwnerRoomResultVisibilityOutsideInvocation({ apiUrl, task, expectedStatus }) {
  if (expectedStatus !== "in_review") return { publish: true };
  try {
    const taskState = await latestTaskRoomStateOutsideInvocation(apiUrl, task, null);
    const reviewStatus = textParam(asRecord3(taskState?.review), "status");
    if (reviewStatus === "correction_requested") {
      return { publish: false, reason: "task_feedback_continues_in_task_room" };
    }
    if (reviewStatus === "owner_verified") {
      return {
        publish: true,
        transformAssistantMessage: normalizeTaskOwnerCompletionReport
      };
    }
  } catch {
  }
  return { publish: true };
}
function normalizeTaskOwnerCompletionReport(message) {
  let normalized = String(message || "");
  const replaceKoreanApproval = (_match, prefix, subject) => `${prefix}${String(subject).trim()}\uC758 \uC218\uB77D \uAE30\uC900 \uCDA9\uC871\uC744 \uD655\uC778\uD574 \uC644\uB8CC \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.`;
  normalized = normalized.replace(
    /(^|\n)([^\n.!?]{1,160}?)(?:을|를)\s+(?:승인|수락)(?:(?:하고|하여|해)\s+완료\s+처리|\s+완료(?:\s+처리)?|\s+처리)?했습니다[.!]?/g,
    replaceKoreanApproval
  );
  normalized = normalized.replace(
    /\bI\s+(?:have\s+)?(?:approved|accepted)\s+(?:this|the)\s+(?:Task|work)\b/gi,
    "I technically verified the Task and marked it done"
  );
  normalized = normalized.replace(
    /(^|\n)([^\n.!?]{1,160}?)\s+(?:was|is|has been)\s+(?:approved|accepted)(?:\s+and\s+(?:marked|set)\s+done)?[.!]?/gi,
    (_match, prefix, subject) => `${prefix}${String(subject).trim()} was technically verified and marked done.`
  );
  return normalized;
}
async function completeTaskOwnerNotificationOutsideInvocation({
  apiUrl,
  task,
  eventId,
  expectedStatus,
  jobId,
  reportCommentId,
  reportFingerprint,
  result
}) {
  const taskState = await latestTaskRoomStateOutsideInvocation(apiUrl, task, null);
  if (!taskState) return { skipped: true, reason: "task_room_state_missing" };
  const notification = asRecord3(taskState.ownerNotification);
  if (textParam(notification, "reportCommentId") !== reportCommentId) {
    return { skipped: true, reason: "review_cycle_changed" };
  }
  taskState.ownerNotification = {
    ...notification,
    eventId,
    status: result?.ok ? "completed" : "failed",
    taskStatus: expectedStatus,
    jobId,
    reportCommentId,
    reportFingerprint,
    resultCommentId: result?.resultCommentId ?? null,
    ...result?.ok ? {} : {
      error: String(result?.error || "The owner Room turn failed.").slice(0, 500)
    },
    updatedAt: now()
  };
  await upsertRoomDocumentOutsideInvocation(apiUrl, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    title: "Task Room state",
    format: "markdown",
    changeSummary: result?.ok ? "Complete automatic Task owner report" : "Record failed automatic Task owner report"
  });
  return { ok: result?.ok === true };
}
function activeRoomProcessBlocksOwnerReport(ownerState, existingJob, activeProcessJob) {
  if (!activeProcessJob) return false;
  if (ownerState?.pendingTurn || existingJob) return true;
  return ["working", "finishing"].includes(textParam(ownerState?.runtime?.activity, "status"));
}
async function runAutomaticTaskOwnerReport(ctx, { companyId, eventId, taskIssueId, ownerRoomIssueId, expectedStatus, reportCommentId, reportFingerprint }) {
  const task = await ctx.issues.get(taskIssueId, companyId);
  if (!task || task.status !== expectedStatus || !TASK_OWNER_REPORT_STATUSES.has(task.status)) {
    return { skipped: true, reason: "task_status_changed" };
  }
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room" || taskState.originatingRoomIssueId !== ownerRoomIssueId) {
    return { skipped: true, reason: "task_room_state_missing" };
  }
  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, ownerRoomIssueId);
  if (taskState.owningAgentId !== agent.id) {
    return { skipped: true, reason: "task_owner_agent_mismatch" };
  }
  const runtime = await getRuntimeConfig(ctx);
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  let ownerJobs = await listRoomJobs(ctx, ownerRoom.id);
  ownerJobs = await reconcileRoomJobLedger(ctx, ownerRoom.id, ownerState, ownerJobs);
  const existingJob = ownerJobs.find((job2) => ACTIVE_ROOM_JOB_STATUSES.has(job2.status)) ?? null;
  const activeProcessJob = activeRoomMessageJobs.get(ownerRoom.id) ?? null;
  const processJobBlocks = activeRoomProcessBlocksOwnerReport(ownerState, existingJob, activeProcessJob);
  if (ownerState.pendingTurn && !existingJob && !activeProcessJob) {
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", "Recovered stale Room activity before automatic Task owner report.");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Recover stale Room activity before Task owner report");
  } else if (ownerState.pendingTurn || existingJob || processJobBlocks) {
    return { skipped: true, reason: "owner_room_busy" };
  }
  const comments = await ctx.issues.listComments(task.id, companyId);
  const report = latestTaskBoundaryReport(comments, taskState, task.status);
  if (!report || report.kind !== task.status || report.comment.id !== reportCommentId || report.fingerprint !== reportFingerprint) {
    return { skipped: true, reason: "worker_report_missing_or_changed" };
  }
  if (taskBoundaryAlreadyReported(taskState, report)) {
    return { skipped: true, reason: "duplicate_worker_report" };
  }
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_report",
    sourceCommentId: null,
    payload: { message: taskOwnerReportPrompt(task, taskState, comments), eventId, taskStatus: task.status, reportCommentId }
  });
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id, null);
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist queued automatic Task owner report");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  taskState.review ??= {};
  taskState.review.status = task.status === "blocked" ? "blocked_reported" : "owner_review_requested";
  taskState.review.workerReportCommentId = report.comment.id;
  taskState.review.workerReportFingerprint = report.fingerprint;
  taskState.review.updatedAt = now();
  taskState.ownerNotification = {
    eventId,
    status: "working",
    taskStatus: task.status,
    jobId: job.id,
    reportCommentId: report.comment.id,
    reportFingerprint: report.fingerprint,
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Queue automatic Task owner report"
  });
  let launched;
  try {
    launched = await launchRoomMessageWithinAction(ctx, {
      companyId,
      runtime,
      job,
      issue: ownerRoom,
      agent,
      state: ownerState,
      resultVisibilityResolver: () => taskOwnerRoomResultVisibilityOutsideInvocation({
        apiUrl: runtime.spsApiUrl,
        task,
        expectedStatus
      }),
      completionObserver: (result) => completeTaskOwnerNotificationOutsideInvocation({
        apiUrl: runtime.spsApiUrl,
        task,
        eventId,
        expectedStatus,
        jobId: job.id,
        reportCommentId,
        reportFingerprint,
        result
      })
    });
  } catch (error) {
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist failed automatic Task owner report launch").catch(() => {
    });
    const failedTaskState = await latestTaskRoomStateOutsideInvocation(runtime.spsApiUrl, task, taskState).catch(() => taskState);
    failedTaskState.ownerNotification = {
      ...asRecord3(failedTaskState.ownerNotification),
      eventId,
      status: "failed",
      taskStatus: expectedStatus,
      jobId: job.id,
      reportCommentId,
      reportFingerprint,
      error: String(error instanceof Error ? error.message : error).slice(0, 500),
      updatedAt: now()
    };
    await upsertRoomDocumentOutsideInvocation(runtime.spsApiUrl, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(failedTaskState),
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Record failed automatic Task owner report"
    }).catch(() => {
    });
    await createRoomCommentOutsideInvocation(
      runtime.spsApiUrl,
      ownerRoom.id,
      `**System - Task owner report failed**
${task.identifier ?? task.id} could not be reviewed automatically: ${String(error instanceof Error ? error.message : error).slice(0, 500)}`
    ).catch(() => {
    });
    throw error;
  }
  return {
    ok: true,
    taskId: task.id,
    ownerRoomIssueId: ownerRoom.id,
    jobId: job.id,
    completion: launched.completion
  };
}
function issueRunTimestamp(run) {
  return new Date(run?.finishedAt || run?.startedAt || run?.createdAt || 0).getTime() || 0;
}
function sortedIssueRuns(runs) {
  return [...Array.isArray(runs) ? runs : []].sort((left, right) => issueRunTimestamp(right) - issueRunTimestamp(left));
}
function issueRunErrorFamily(run) {
  const result = asRecord3(run?.resultJson);
  return textParam(run, "errorFamily") || textParam(result, "errorFamily") || textParam(run, "errorCode");
}
function isProviderQuotaRun(run) {
  return issueRunErrorFamily(run) === PROVIDER_QUOTA_ERROR_CODE;
}
function issueRunRetryNotBefore(run) {
  const result = asRecord3(run?.resultJson);
  const value = textParam(run, "retryNotBefore") || textParam(result, "retryNotBefore") || textParam(result, "providerQuotaRetryNotBefore") || textParam(result, "transientRetryNotBefore");
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}
function providerQuotaRecoveryAction(action) {
  const evidence = asRecord3(action?.evidence);
  return textParam(evidence, "latestRunErrorCode") === PROVIDER_QUOTA_ERROR_CODE || textParam(evidence, "latestRunErrorFamily") === PROVIDER_QUOTA_ERROR_CODE;
}
function nextProviderQuotaRetryAt(run, current = Date.now()) {
  const requested = issueRunRetryNotBefore(run);
  const requestedAt = new Date(requested || 0).getTime();
  return new Date(Math.max(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS, Number.isFinite(requestedAt) ? requestedAt : 0)).toISOString();
}
function providerQuotaRetryState(run, currentState = {}, current = Date.now()) {
  const runId = textParam(run, "runId") || textParam(run, "id");
  const previous = asRecord3(currentState);
  const sameRun = textParam(previous, "lastFailedRunId") === runId;
  return {
    ...previous,
    status: sameRun && textParam(previous, "status") ? textParam(previous, "status") : "waiting",
    provider: "agy",
    intervalMinutes: 30,
    lastFailedRunId: runId || textParam(previous, "lastFailedRunId") || null,
    nextRetryAt: sameRun && textParam(previous, "nextRetryAt") ? textParam(previous, "nextRetryAt") : nextProviderQuotaRetryAt(run, current),
    attempt: sameRun ? Math.max(0, Number(previous.attempt) || 0) : Math.max(0, Number(previous.attempt) || 0) + 1,
    lastWakeRunId: sameRun ? textParam(previous, "lastWakeRunId") || null : null,
    updatedAt: sameRun && textParam(previous, "updatedAt") ? textParam(previous, "updatedAt") : now()
  };
}
function workerRuntimeRecoveryAction(task, taskState) {
  const action = asRecord3(task?.activeRecoveryAction);
  const workerAgentId = textParam(taskState, "workerAgentId");
  const cause = textParam(action, "cause");
  const returnedWorkerId = textParam(action, "returnOwnerAgentId") || textParam(action, "previousOwnerAgentId");
  if (!textParam(action, "id") || !workerAgentId) return null;
  if (textParam(action, "kind") !== "stranded_assigned_issue") return null;
  if (!TASK_WORKER_RUNTIME_RECOVERY_CAUSES.has(cause)) return null;
  if (returnedWorkerId !== workerAgentId) return null;
  return action;
}
function recoveryWorkerAgentId(task) {
  const action = asRecord3(task?.activeRecoveryAction);
  const cause = textParam(action, "cause");
  const workerAgentId = textParam(action, "returnOwnerAgentId") || textParam(action, "previousOwnerAgentId");
  if (!textParam(action, "id") || !workerAgentId) return "";
  if (textParam(action, "kind") !== "stranded_assigned_issue") return "";
  if (!TASK_WORKER_RUNTIME_RECOVERY_CAUSES.has(cause)) return "";
  return workerAgentId;
}
async function recoverLegacyTaskRoomState(ctx, event, task) {
  const workerAgentId = recoveryWorkerAgentId(task);
  if (!workerAgentId || !task.parentId) return null;
  let ownerRoom;
  let ownerAgent;
  let worker;
  try {
    ({ issue: ownerRoom, agent: ownerAgent } = await requireRoom(ctx, event.companyId, task.parentId));
    worker = await ctx.agents.get(workerAgentId, event.companyId);
  } catch {
    return null;
  }
  if (!worker || !isTaskWorkerAgent(worker)) return null;
  const state = {
    version: 1,
    kind: "task_room",
    taskIssueId: task.id,
    projectId: task.projectId ?? ownerRoom.projectId ?? null,
    originatingRoomIssueId: ownerRoom.id,
    owningAgentId: ownerAgent.id,
    owningAgentName: ownerAgent.name,
    owningAgentRole: ownerAgent.role ?? null,
    workerAgentId,
    taskType: "general",
    projectWorkspaceId: task.projectWorkspaceId ?? null,
    projectWorkspaceName: null,
    declaredAffectedPaths: [],
    designReferences: [],
    acceptanceCriteria: [],
    verification: [],
    dependencyTaskIds: [],
    review: {
      required: "owning_agent",
      status: "not_requested",
      workerReportCommentId: null,
      updatedAt: now()
    },
    legacyRecovery: true
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(state),
    companyId: event.companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Recover direct Worker Task Room state after runtime failure"
  });
  return state;
}
function workerRuntimeRecoveryFailure(action) {
  const evidence = asRecord3(action?.evidence);
  return textParam(evidence, "latestRunErrorCode") || textParam(action, "cause") || "runtime_unavailable";
}
function workerRuntimeRecoveryAlreadyReported(taskState, actionId) {
  const notification = asRecord3(taskState?.ownerNotification);
  return textParam(notification, "kind") === "runtime_block" && textParam(notification, "recoveryActionId") === actionId && ["working", "completed", "queued"].includes(textParam(notification, "status"));
}
function workerRuntimeBlockOwnerPrompt(task, taskState, worker, action) {
  const evidence = asRecord3(action?.evidence);
  return [
    "AUTOMATIC WORKER RUNTIME BLOCK REPORT.",
    "A Worker could not complete its assigned Task because its local runtime failed before it could submit a Worker blocker report.",
    "Do not perform the Worker's production work yourself. Do not reassign or close the Task. The Task remains assigned to the Worker and is blocked until its runtime is repaired or resumed.",
    "Report the blocker to the user in this long-lived Agent Room: identify the affected Task, the exact runtime failure class, the impact, and the smallest next step. Do not create any Task approval or question interaction. Usually the next step is restoring the runtime or quota and then manually resuming the Worker before the owner moves the Task back to todo.",
    `Task: ${task.identifier ?? task.id} ${task.title}`,
    `Task status: ${task.status}`,
    `Assigned Worker: ${worker?.name ?? textParam(taskState, "workerAgentId")}`,
    `Runtime failure class: ${workerRuntimeRecoveryFailure(action)}`,
    `Recovery cause: ${textParam(action, "cause")}`,
    `Last failed run: ${textParam(evidence, "latestRunId") || "unknown"}`,
    `Task description:
${trimRoomContext(task.description, 12e3) || "No description."}`,
    `Task Room state:
${trimRoomContext(JSON.stringify(taskState), 6e3)}`
  ].join("\n\n");
}
async function runAutomaticWorkerRuntimeBlockReport(ctx, input) {
  const task = await ctx.issues.get(input.taskIssueId, input.companyId);
  if (!task || task.status !== "blocked") return { skipped: true, reason: "task_status_changed" };
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, input.companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room" || taskState.originatingRoomIssueId !== input.ownerRoomIssueId) {
    return { skipped: true, reason: "task_room_state_missing" };
  }
  if (workerRuntimeRecoveryAlreadyReported(taskState, input.recoveryActionId)) {
    return { skipped: true, reason: "duplicate_runtime_block" };
  }
  const { issue: ownerRoom, agent: ownerAgent } = await requireRoom(ctx, input.companyId, input.ownerRoomIssueId);
  if (taskState.owningAgentId !== ownerAgent.id) {
    return { skipped: true, reason: "task_owner_agent_mismatch" };
  }
  const runtime = await getRuntimeConfig(ctx);
  const worker = await ctx.agents.get(input.workerAgentId, input.companyId).catch(() => null);
  const failureClass = workerRuntimeRecoveryFailure(input.recoveryAction);
  const summary = `**System - Worker runtime blocked**
${task.identifier ?? task.id} ${task.title} is blocked because ${worker?.name ?? "the assigned Worker"} could not run (${failureClass}). The Task remains assigned to that Worker; no manager production work is authorized.`;
  const ownerState = await loadRoomState(ctx, input.companyId, ownerRoom, ownerAgent);
  const existingJob = await activeRoomJob(ctx, ownerRoom.id);
  if (ownerState.pendingTurn || existingJob) {
    await ctx.issues.createComment(ownerRoom.id, `${summary}
The owner Room is busy, so this report is left here for the next review turn.`, input.companyId);
    taskState.review ??= {};
    taskState.review.status = "runtime_blocked";
    taskState.review.runtimeRecoveryActionId = input.recoveryActionId;
    taskState.review.updatedAt = now();
    taskState.ownerNotification = {
      eventId: input.eventId,
      kind: "runtime_block",
      status: "queued",
      taskStatus: "blocked",
      recoveryActionId: input.recoveryActionId,
      failureClass,
      updatedAt: now()
    };
    await upsertRoomDocument(ctx, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(taskState),
      companyId: input.companyId,
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Queue Worker runtime block for the next owner Room turn"
    });
    return { skipped: true, reason: "owner_room_busy" };
  }
  const sourceComment = await ctx.issues.createComment(ownerRoom.id, summary, input.companyId);
  const job = await createRoomJob(ctx, {
    companyId: input.companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_report",
    sourceCommentId: sourceComment.id ?? null,
    payload: {
      message: workerRuntimeBlockOwnerPrompt(task, taskState, worker, input.recoveryAction),
      eventId: input.eventId,
      taskStatus: "blocked",
      recoveryActionId: input.recoveryActionId,
      runtimeBlock: true
    }
  });
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: sourceComment.id ?? null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id, sourceComment.id ?? null);
  await saveRoomState(ctx, input.companyId, ownerRoom.id, ownerState, "Persist queued Worker runtime block report");
  emitRoomEvent(ctx, input.companyId, ownerRoom.id, { type: "job", job });
  taskState.review ??= {};
  taskState.review.status = "runtime_blocked";
  taskState.review.runtimeRecoveryActionId = input.recoveryActionId;
  taskState.review.updatedAt = now();
  taskState.ownerNotification = {
    eventId: input.eventId,
    kind: "runtime_block",
    status: "working",
    taskStatus: "blocked",
    jobId: job.id,
    recoveryActionId: input.recoveryActionId,
    failureClass,
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId: input.companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Queue automatic Worker runtime block owner report"
  });
  try {
    const completedJob = await runDurableRoomMessage(ctx, { companyId: input.companyId, runtime, job });
    taskState.ownerNotification = {
      ...taskState.ownerNotification,
      status: "completed",
      resultCommentId: completedJob?.resultCommentId ?? null,
      updatedAt: now()
    };
    await upsertRoomDocument(ctx, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(taskState),
      companyId: input.companyId,
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Complete automatic Worker runtime block owner report"
    });
    return { ok: true, taskId: task.id, ownerRoomIssueId: ownerRoom.id, jobId: job.id };
  } catch (error) {
    taskState.ownerNotification = {
      ...taskState.ownerNotification,
      status: "failed",
      error: String(error instanceof Error ? error.message : error).slice(0, 500),
      updatedAt: now()
    };
    await upsertRoomDocument(ctx, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(taskState),
      companyId: input.companyId,
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Record failed Worker runtime block owner report"
    }).catch(() => {
    });
    throw error;
  }
}
async function normalizeWorkerRuntimeRecovery(ctx, event, task, taskState) {
  const recoveryAction = workerRuntimeRecoveryAction(task, taskState);
  if (!recoveryAction) return null;
  const existing = activeWorkerRuntimeRecoveries.get(task.id);
  if (existing) return { scheduled: false, reason: "worker_runtime_recovery_in_progress", completion: existing };
  const completion = (async () => {
    const runtime = await getRuntimeConfig(ctx);
    const workerAgentId = textParam(taskState, "workerAgentId");
    const worker = await ctx.agents.get(workerAgentId, event.companyId).catch(() => null);
    if (providerQuotaRecoveryAction(recoveryAction)) {
      const evidence = asRecord3(recoveryAction.evidence);
      const failedRun = {
        runId: textParam(evidence, "latestRunId"),
        errorCode: PROVIDER_QUOTA_ERROR_CODE,
        resultJson: {
          errorFamily: PROVIDER_QUOTA_ERROR_CODE,
          retryNotBefore: textParam(evidence, "retryNotBefore") || null
        }
      };
      await paperclipJsonDirect(runtime.spsApiUrl, `/api/issues/${encodeURIComponent(task.id)}/recovery-actions/resolve`, {
        method: "POST",
        body: {
          actionId: recoveryAction.id,
          outcome: "false_positive",
          sourceIssueStatus: "in_review",
          resolutionNote: "Provider quota blocks this assigned Task. Automatic retry is disabled, so preserve the Worker assignment and report the blocker through the Task owner Room."
        },
        operation: "Worker provider quota recovery resolution"
      });
      await updateIssueDirect(runtime.spsApiUrl, task.id, { status: "blocked" });
      await updateIssueDirect(runtime.spsApiUrl, task.id, {
        assigneeAgentId: workerAgentId,
        assigneeUserId: null,
        executionPolicy: taskExecutionPolicyWithAutomaticRetry(task, false)
      });
      taskState.quotaRetry = providerQuotaRetryState(failedRun, taskState.quotaRetry);
      taskState.quotaRetry.status = "disabled";
      taskState.quotaRetry.holdReason = "provider_quota";
      taskState.quotaRetry.automaticRetry = false;
      taskState.quotaRetry.nextRetryAt = null;
      await upsertRoomDocument(ctx, {
        issueId: task.id,
        key: TASK_ROOM_STATE_KEY,
        body: serializeState(taskState),
        companyId: event.companyId,
        title: "Task Room state",
        format: "markdown",
        changeSummary: "Record Worker provider quota block with automatic retry disabled"
      });
      const eventId2 = textParam(event, "eventId") || `${task.id}:runtime:${recoveryAction.id}`;
      return runAutomaticWorkerRuntimeBlockReport(ctx, {
        companyId: event.companyId,
        eventId: eventId2,
        taskIssueId: task.id,
        ownerRoomIssueId: taskState.originatingRoomIssueId,
        workerAgentId,
        recoveryActionId: recoveryAction.id,
        recoveryAction
      });
    }
    if (textParam(worker, "status") === "error") {
      await paperclipJsonDirect(runtime.spsApiUrl, `/api/agents/${encodeURIComponent(workerAgentId)}/pause`, {
        method: "POST",
        body: {},
        operation: "Worker runtime pause"
      });
    }
    await paperclipJsonDirect(runtime.spsApiUrl, `/api/issues/${encodeURIComponent(task.id)}/recovery-actions/resolve`, {
      method: "POST",
      body: {
        actionId: recoveryAction.id,
        outcome: "false_positive",
        sourceIssueStatus: "in_review",
        resolutionNote: "Worker runtime failure is a blocked capacity condition. Preserve the Worker assignment and report through the Task owner Room; manager production work is not authorized."
      },
      operation: "Worker runtime recovery resolution"
    });
    await updateIssueDirect(runtime.spsApiUrl, task.id, { status: "blocked" });
    await updateIssueDirect(runtime.spsApiUrl, task.id, { assigneeAgentId: workerAgentId, assigneeUserId: null });
    const eventId = textParam(event, "eventId") || `${task.id}:runtime:${recoveryAction.id}`;
    return runAutomaticWorkerRuntimeBlockReport(ctx, {
      companyId: event.companyId,
      eventId,
      taskIssueId: task.id,
      ownerRoomIssueId: taskState.originatingRoomIssueId,
      workerAgentId,
      recoveryActionId: recoveryAction.id,
      recoveryAction
    });
  })();
  activeWorkerRuntimeRecoveries.set(task.id, completion);
  try {
    const result = await completion;
    return {
      scheduled: true,
      normalized: true,
      reason: "worker_runtime_recovery_normalized",
      taskId: task.id,
      completion,
      result
    };
  } finally {
    if (activeWorkerRuntimeRecoveries.get(task.id) === completion) activeWorkerRuntimeRecoveries.delete(task.id);
  }
}
async function writeProviderQuotaRetryState(ctx, companyId, task, taskState, changeSummary) {
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary
  });
}
function issueExecutionAutomaticallyRetries(task) {
  return asRecord3(asRecord3(task?.executionPolicy).failure).automaticRetry === true;
}
function taskExecutionPolicyWithAutomaticRetry(task, automaticRetry) {
  const policy = asRecord3(task?.executionPolicy);
  const failure = asRecord3(policy.failure);
  return {
    ...policy,
    mode: textParam(policy, "mode") || "normal",
    stages: Array.isArray(policy.stages) ? policy.stages : [],
    failure: {
      ...failure,
      automaticRetry,
      preserveAssignee: failure.preserveAssignee !== false,
      wakeRecoveryOwner: failure.wakeRecoveryOwner === true
    },
    commentRequired: policy.commentRequired !== false
  };
}
async function disableTaskAutomaticRetry(ctx, runtime, companyId, task, taskState) {
  const wasAutomatic = issueExecutionAutomaticallyRetries(task);
  const priorQuotaRetry = asRecord3(taskState?.quotaRetry);
  const hadQuotaRetry = Object.keys(priorQuotaRetry).length > 0;
  const executionPolicy = taskExecutionPolicyWithAutomaticRetry(task, false);
  if (wasAutomatic) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { executionPolicy });
    task.executionPolicy = executionPolicy;
  }
  const runs = sortedIssueRuns(await listIssueRunsDirect(runtime.spsApiUrl, task.id));
  const scheduledRuns = runs.filter((run) => textParam(run, "status") === "scheduled_retry");
  const desiredStatus = textParam(task, "status");
  for (const run of scheduledRuns) {
    const runId = textParam(run, "runId") || textParam(run, "id");
    if (!runId) continue;
    await paperclipJsonDirect(runtime.spsApiUrl, `/api/heartbeat-runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      body: {},
      operation: "Cancel disabled Task automatic retry"
    });
  }
  if (scheduledRuns.length > 0 && desiredStatus) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { status: desiredStatus, executionPolicy });
    task.status = desiredStatus;
    task.executionPolicy = executionPolicy;
  }
  if (hadQuotaRetry || wasAutomatic || scheduledRuns.length > 0) {
    taskState.quotaRetry = {
      ...priorQuotaRetry,
      status: "disabled",
      provider: textParam(priorQuotaRetry, "provider") || "agy",
      automaticRetry: false,
      scheduledRunId: null,
      nextRetryAt: null,
      updatedAt: now()
    };
    await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Disable Task automatic provider retry");
  }
  return { changed: wasAutomatic || hadQuotaRetry || scheduledRuns.length > 0, cancelledRuns: scheduledRuns.length };
}
async function cancelResolvedTaskWorkerQuotaRetry(ctx, { companyId, task, taskState }) {
  const desiredStatus = textParam(task, "status");
  if (!TASK_WORKER_RETRY_STOP_STATUSES.has(desiredStatus)) return false;
  const wasAutomatic = issueExecutionAutomaticallyRetries(task);
  const quotaRetry = asRecord3(taskState?.quotaRetry);
  const hadQuotaRetry = Boolean(Object.keys(quotaRetry).length);
  if (!wasAutomatic && !hadQuotaRetry) return false;
  const runtime = await getRuntimeConfig(ctx);
  const executionPolicy = taskExecutionPolicyWithAutomaticRetry(task, false);
  if (wasAutomatic) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { executionPolicy });
    task.executionPolicy = executionPolicy;
  }
  const runs = sortedIssueRuns(await listIssueRunsDirect(runtime.spsApiUrl, task.id));
  const scheduledRuns = runs.filter((run) => textParam(run, "status") === "scheduled_retry");
  for (const run of scheduledRuns) {
    const runId = textParam(run, "runId") || textParam(run, "id");
    if (!runId) continue;
    await paperclipJsonDirect(runtime.spsApiUrl, `/api/heartbeat-runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      body: {},
      operation: "Resolved Task Worker retry cancellation"
    });
  }
  if (hadQuotaRetry) {
    taskState.quotaRetry = {
      ...quotaRetry,
      status: "resolved",
      resolvedBy: "task_status_change",
      resolvedTaskStatus: desiredStatus,
      scheduledRunId: null,
      activeRunId: null,
      nextRetryAt: null,
      updatedAt: now()
    };
    await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Close Worker provider quota retry at Task review or completion");
  }
  if (scheduledRuns.length || wasAutomatic) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, {
      status: desiredStatus,
      executionPolicy
    });
    task.status = desiredStatus;
    task.executionPolicy = executionPolicy;
  }
  return scheduledRuns.length > 0 || wasAutomatic || hadQuotaRetry;
}
async function reconcileProviderQuotaTask(ctx, runtime, companyId, task, agentsById, current = Date.now()) {
  const document = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(document?.body);
  if (!taskState || taskState.kind !== "task_room") return { outcome: "skipped", reason: "task_room_state_missing" };
  const workerAgentId = textParam(taskState, "workerAgentId") || textParam(task, "assigneeAgentId");
  const worker = agentsById.get(workerAgentId);
  if (!worker || textParam(worker, "adapterType") !== "antigravity_local") {
    return { outcome: "skipped", reason: "not_agy_worker" };
  }
  if (!AUTOMATIC_PROVIDER_QUOTA_RETRY_ENABLED) {
    const disabled = await disableTaskAutomaticRetry(ctx, runtime, companyId, task, taskState);
    return { outcome: "automatic_retry_disabled", ...disabled };
  }
  if (!issueExecutionAutomaticallyRetries(task)) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { executionPolicy: TASK_ROOM_EXECUTION_POLICY });
    task.executionPolicy = TASK_ROOM_EXECUTION_POLICY;
  }
  const runs = sortedIssueRuns(await listIssueRunsDirect(runtime.spsApiUrl, task.id));
  const scheduled = runs.find((run) => textParam(run, "status") === "scheduled_retry");
  if (scheduled) {
    const nextRetryAt = textParam(scheduled, "scheduledRetryAt") || issueRunRetryNotBefore(scheduled);
    const previous = asRecord3(taskState.quotaRetry);
    if (textParam(previous, "status") !== "core_scheduled" || textParam(previous, "scheduledRunId") !== (textParam(scheduled, "runId") || textParam(scheduled, "id")) || textParam(previous, "nextRetryAt") !== nextRetryAt) {
      taskState.quotaRetry = {
        ...previous,
        status: "core_scheduled",
        provider: "agy",
        intervalMinutes: 30,
        lastFailedRunId: textParam(scheduled, "retryOfRunId") || textParam(previous, "lastFailedRunId") || null,
        scheduledRunId: textParam(scheduled, "runId") || textParam(scheduled, "id") || null,
        nextRetryAt: nextRetryAt || new Date(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS).toISOString(),
        updatedAt: now()
      };
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Track SPS's scheduled provider quota retry");
    }
    return { outcome: "core_scheduled", nextRetryAt: taskState.quotaRetry.nextRetryAt };
  }
  const latest = runs[0];
  if (!latest) return { outcome: "skipped", reason: "no_runs" };
  const latestStatus = textParam(latest, "status");
  if (["queued", "running"].includes(latestStatus)) {
    if (taskState.quotaRetry && textParam(taskState.quotaRetry, "status") !== "executing") {
      taskState.quotaRetry = { ...asRecord3(taskState.quotaRetry), status: "executing", activeRunId: textParam(latest, "runId") || textParam(latest, "id") || null, updatedAt: now() };
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Record active provider quota retry run");
    }
    return { outcome: "executing" };
  }
  if (!isProviderQuotaRun(latest)) {
    if (taskState.quotaRetry && textParam(taskState.quotaRetry, "status") !== "resolved") {
      taskState.quotaRetry = {
        ...asRecord3(taskState.quotaRetry),
        status: "resolved",
        resolvedByRunId: textParam(latest, "runId") || textParam(latest, "id") || null,
        resolvedRunStatus: latestStatus || null,
        nextRetryAt: null,
        updatedAt: now()
      };
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Close provider quota retry after a non-quota terminal run");
    }
    return { outcome: "resolved", runStatus: latestStatus || null };
  }
  const previousQuotaRetry = JSON.stringify(asRecord3(taskState.quotaRetry));
  taskState.quotaRetry = providerQuotaRetryState(latest, taskState.quotaRetry, current);
  const retryAt = new Date(taskState.quotaRetry.nextRetryAt || 0).getTime();
  if (!Number.isFinite(retryAt) || retryAt > current) {
    if (JSON.stringify(taskState.quotaRetry) !== previousQuotaRetry) {
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Persist the next 30-minute provider quota retry");
    }
    return { outcome: "waiting", nextRetryAt: taskState.quotaRetry.nextRetryAt };
  }
  if (["paused", "error"].includes(textParam(worker, "status"))) {
    taskState.quotaRetry = {
      ...taskState.quotaRetry,
      status: "waiting_for_worker",
      nextRetryAt: new Date(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS).toISOString(),
      updatedAt: now()
    };
    await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Defer provider quota retry while the assigned Worker is unavailable");
    return { outcome: "waiting_for_worker", nextRetryAt: taskState.quotaRetry.nextRetryAt };
  }
  const failedRunId = textParam(latest, "runId") || textParam(latest, "id");
  let wakeRunId = null;
  if (textParam(task, "status") === "blocked" && textParam(taskState.quotaRetry, "holdReason") === "provider_quota") {
    const activated = await updateIssueDirect(runtime.spsApiUrl, task.id, {
      status: "todo",
      assigneeAgentId: workerAgentId,
      assigneeUserId: null,
      executionPolicy: TASK_ROOM_EXECUTION_POLICY
    });
    wakeRunId = textParam(activated, "executionRunId") || `assignment:${Date.now()}`;
  } else {
    const wake = await paperclipJsonDirect(runtime.spsApiUrl, `/api/agents/${encodeURIComponent(workerAgentId)}/wakeup`, {
      method: "POST",
      body: {
        source: "automation",
        triggerDetail: "system",
        reason: "provider_quota_retry",
        payload: { issueId: task.id, taskId: task.id, retryOfRunId: failedRunId },
        idempotencyKey: `provider-quota:${task.id}:${failedRunId}:${taskState.quotaRetry.attempt}`
      },
      operation: "Worker provider quota retry wakeup"
    });
    wakeRunId = textParam(wake, "id") || textParam(wake, "runId") || null;
  }
  taskState.quotaRetry = {
    ...taskState.quotaRetry,
    status: "dispatched",
    lastWakeRunId: wakeRunId,
    dispatchedAt: now(),
    nextRetryAt: new Date(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS).toISOString(),
    updatedAt: now()
  };
  await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Dispatch the same Worker Task after its provider quota wait");
  return { outcome: "dispatched", wakeRunId, nextRetryAt: taskState.quotaRetry.nextRetryAt };
}
async function reconcileProviderQuotaRetries(ctx, options = {}) {
  if (activeProviderQuotaReconcile) return activeProviderQuotaReconcile;
  const operation = (async () => {
    const runtime = await getRuntimeConfig(ctx);
    const companies = await listCompaniesDirect(runtime.spsApiUrl);
    const current = Number(options.current) || Date.now();
    const summary = { companies: companies.length, scanned: 0, waiting: 0, scheduled: 0, dispatched: 0, resolved: 0, skipped: 0, failed: 0 };
    for (const company of companies) {
      const [agents, issues] = await Promise.all([
        listCompanyAgentsDirect(runtime.spsApiUrl, company.id),
        listCompanyIssuesDirect(runtime.spsApiUrl, company.id)
      ]);
      const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
      const tasks = issues.filter((issue) => issue?.parentId && (ACTIVE_TASK_STATUSES.has(issue.status) || issue.status === "blocked"));
      for (const task of tasks) {
        summary.scanned += 1;
        try {
          const result = await reconcileProviderQuotaTask(ctx, runtime, company.id, task, agentsById, current);
          if (["waiting", "waiting_for_worker"].includes(result.outcome)) summary.waiting += 1;
          else if (result.outcome === "core_scheduled") summary.scheduled += 1;
          else if (result.outcome === "dispatched") summary.dispatched += 1;
          else if (result.outcome === "resolved") summary.resolved += 1;
          else summary.skipped += 1;
        } catch (error) {
          summary.failed += 1;
          ctx.logger?.warn?.("Provider quota retry reconciliation failed for one Task.", {
            companyId: company.id,
            issueId: task.id,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    return summary;
  })();
  activeProviderQuotaReconcile = operation;
  try {
    return await operation;
  } finally {
    if (activeProviderQuotaReconcile === operation) activeProviderQuotaReconcile = null;
  }
}
async function handleTaskStatusUpdated(ctx, event) {
  if (!event?.companyId || !event?.entityId) return { scheduled: false, reason: "missing_event_identity" };
  const { previousStatus, nextStatus } = taskStatusTransition(event);
  const task = await ctx.issues.get(event.entityId, event.companyId);
  if (!task?.parentId) return { scheduled: false, reason: "not_child_task" };
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, event.companyId);
  let taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room" || taskState.originatingRoomIssueId !== task.parentId) {
    taskState = await recoverLegacyTaskRoomState(ctx, event, task);
    if (!taskState) return { scheduled: false, reason: "not_collaborative_task_room" };
  }
  const ownerRoom = await ctx.issues.get(task.parentId, event.companyId);
  const ownerAgentId = agentRoomAgentId(ownerRoom);
  if (!ownerAgentId || taskState.owningAgentId !== ownerAgentId) {
    return { scheduled: false, reason: "task_owner_agent_mismatch" };
  }
  const workerRetryClosed = await cancelResolvedTaskWorkerQuotaRetry(ctx, {
    companyId: event.companyId,
    task,
    taskState
  });
  if (workerRetryClosed && ["done", "cancelled"].includes(task.status)) {
    return { scheduled: false, reason: "resolved_task_worker_retry_cancelled" };
  }
  if (await cancelResolvedTaskOwnerQuotaRetry(ctx, {
    companyId: event.companyId,
    task,
    taskState,
    ownerRoom
  })) {
    return { scheduled: false, reason: "resolved_task_owner_retry_cancelled" };
  }
  const runtimeRecovery = await normalizeWorkerRuntimeRecovery(ctx, event, task, taskState);
  if (runtimeRecovery) return runtimeRecovery;
  if (taskState.workerAgentId !== task.assigneeAgentId) {
    return { scheduled: false, reason: "task_worker_assignment_mismatch" };
  }
  const eventAgentId = event.actorType === "agent" ? event.actorId : textParam(asRecord3(event.payload), "agentId");
  if (nextStatus === "done" && eventAgentId && eventAgentId === taskState.workerAgentId) {
    return continueTaskOwnerReportAfterStatusNormalization(ctx, event, {
      task,
      previousStatus: task.status,
      status: "in_review",
      reason: "worker_done_requires_task_owner_verification"
    });
  }
  const comments = await ctx.issues.listComments(task.id, event.companyId);
  const expectedReportKind = TASK_OWNER_REPORT_STATUSES.has(task.status) ? task.status : null;
  const report = latestTaskBoundaryReport(comments, taskState, expectedReportKind);
  if (!report && TASK_WORKER_DISPOSITION_PENDING_STATUSES.has(task.status)) {
    return { scheduled: false, reason: "awaiting_substantive_worker_report" };
  }
  if (report && TASK_WORKER_DISPOSITION_PENDING_STATUSES.has(task.status) && !taskBoundaryAlreadyReported(taskState, report)) {
    return continueTaskOwnerReportAfterStatusNormalization(ctx, event, {
      task,
      previousStatus: task.status,
      status: report.kind,
      reason: "substantive_worker_report_requires_disposition",
      reportCommentId: report.comment.id
    });
  }
  if (!TASK_OWNER_REPORT_STATUSES.has(task.status)) return { scheduled: false, reason: "not_owner_report_status" };
  if (!report) return { scheduled: false, reason: "awaiting_substantive_worker_report" };
  if (report.kind !== task.status) return { scheduled: false, reason: "worker_report_status_mismatch" };
  report.fingerprint = taskReportFingerprint(report.comment.body);
  const ownerRoomIssueId = taskState.originatingRoomIssueId;
  const reportKey = `${task.id}:${report.comment.id}:${report.fingerprint}`;
  const existingReport = activeTaskOwnerReports.get(reportKey);
  if (existingReport) {
    return {
      scheduled: false,
      reason: "worker_report_in_progress",
      taskId: task.id,
      ownerRoomIssueId,
      completion: existingReport
    };
  }
  if (taskBoundaryAlreadyReported(taskState, report)) return { scheduled: false, reason: "duplicate_worker_report" };
  const eventId = textParam(event, "eventId") || `${task.id}:${previousStatus}:${nextStatus || task.status}:${report.comment.id}`;
  if (processedTaskOwnerReportEvents.has(eventId)) return { scheduled: false, reason: "duplicate_event" };
  processedTaskOwnerReportEvents.add(eventId);
  if (processedTaskOwnerReportEvents.size > 1e3) processedTaskOwnerReportEvents.delete(processedTaskOwnerReportEvents.values().next().value);
  await updateRoomWorkState(
    ctx,
    event.companyId,
    ownerRoom,
    {
      latestOutcome: {
        taskId: task.id,
        identifier: task.identifier,
        status: task.status,
        summary: task.status === "blocked" ? "The assigned Worker reported a blocker that requires the owning Agent's handling." : "The assigned Worker submitted evidence for the owning Agent's technical review.",
        sourceReferences: [task.identifier || task.id]
      },
      waitingFor: {
        kind: "task_review",
        taskId: task.id,
        detail: task.status === "blocked" ? "The owning Agent must assess the Worker blocker and report or correct it in this Room." : "The owning Agent must verify the Worker evidence against the Task contract."
      }
    },
    `Record Task owner review boundary for ${task.identifier || task.id}`,
    { kind: "runtime", agentId: ownerAgentId, agentName: taskState.owningAgentName }
  ).catch((error) => {
    ctx.logger?.warn?.("Room Work State could not record the Task review boundary.", {
      roomIssueId: ownerRoom.id,
      taskIssueId: task.id,
      message: error instanceof Error ? error.message : String(error)
    });
  });
  if (taskReviewMode(taskState) === "manual") {
    const recorded = await recordManualTaskOwnerReview(ctx, {
      companyId: event.companyId,
      eventId,
      task,
      taskState,
      ownerRoom,
      report
    });
    return {
      scheduled: false,
      reason: recorded?.reason || "manual_task_owner_review_pending",
      taskId: task.id,
      ownerRoomIssueId,
      manualReviewRecorded: recorded?.ok === true
    };
  }
  const launchPromise = runAutomaticTaskOwnerReport(ctx, {
    companyId: event.companyId,
    eventId,
    taskIssueId: task.id,
    ownerRoomIssueId,
    expectedStatus: task.status,
    reportCommentId: report.comment.id,
    reportFingerprint: report.fingerprint
  });
  activeTaskOwnerReports.set(reportKey, launchPromise);
  try {
    const launched = await launchPromise;
    if (launched?.skipped) {
      if (activeTaskOwnerReports.get(reportKey) === launchPromise) activeTaskOwnerReports.delete(reportKey);
      return {
        scheduled: false,
        reason: launched.reason,
        taskId: task.id,
        ownerRoomIssueId
      };
    }
    const completion = launched?.completion ?? Promise.resolve(launched);
    activeTaskOwnerReports.set(reportKey, completion);
    completion.finally(() => {
      if (activeTaskOwnerReports.get(reportKey) === completion) activeTaskOwnerReports.delete(reportKey);
    }).catch(() => {
    });
    return { scheduled: true, taskId: task.id, ownerRoomIssueId, completion };
  } catch (error) {
    if (activeTaskOwnerReports.get(reportKey) === launchPromise) activeTaskOwnerReports.delete(reportKey);
    throw error;
  }
}
async function continueTaskOwnerReportAfterStatusNormalization(ctx, event, input) {
  await ctx.issues.update(input.task.id, { status: input.status }, event.companyId);
  const followUp = await handleTaskStatusUpdated(ctx, {
    ...event,
    eventId: `${textParam(event, "eventId") || randomUUID2()}:normalized:${input.status}`,
    eventType: "plugin.task-owner-status-normalized",
    occurredAt: now(),
    entityId: input.task.id,
    entityType: "issue",
    payload: {
      ...asRecord3(event.payload),
      status: input.status,
      _previous: { status: input.previousStatus }
    }
  });
  const joinedExistingWake = followUp.reason === "worker_report_in_progress" && Boolean(followUp.completion);
  return {
    ...followUp,
    scheduled: followUp.scheduled === true || joinedExistingWake,
    normalized: true,
    reason: input.reason,
    followUpReason: followUp.reason,
    joinedExistingWake,
    status: input.status,
    ...input.reportCommentId ? { reportCommentId: input.reportCommentId } : {}
  };
}
async function reconcileTaskOwnerReportBoundaries(ctx, options = {}) {
  if (activeTaskOwnerBoundaryReconcile) return activeTaskOwnerBoundaryReconcile;
  const operation = (async () => {
    const runId = textParam(options, "runId") || `task-owner-boundary-reconcile:${Date.now()}`;
    const summary = { runId, companies: 0, scanned: 0, scheduled: 0, healthy: 0, skipped: 0, failed: 0 };
    const companies = await ctx.companies.list({ limit: 200 });
    summary.companies = companies.length;
    for (const company of companies) {
      const seenTaskIds = /* @__PURE__ */ new Set();
      const tasks = await listTaskOwnerBoundaryIssues(ctx, company.id);
      for (const task of tasks) {
        if (!task?.parentId || seenTaskIds.has(task.id)) continue;
        seenTaskIds.add(task.id);
        summary.scanned += 1;
        try {
          const result = await handleTaskStatusUpdated(ctx, {
            eventId: `${runId}:${task.id}:${task.updatedAt || task.status}`,
            eventType: "plugin.task-owner-boundary-reconcile",
            occurredAt: now(),
            actorType: "plugin",
            actorId: manifest_default.id,
            companyId: company.id,
            entityId: task.id,
            entityType: "issue",
            payload: { status: task.status, _previous: { status: task.status } }
          });
          if (result.scheduled) summary.scheduled += 1;
          else if (["duplicate_worker_report", "worker_report_in_progress"].includes(result.reason)) summary.healthy += 1;
          else summary.skipped += 1;
        } catch (error) {
          summary.failed += 1;
          ctx.logger?.warn?.("Task owner boundary reconciliation failed for one Task.", {
            companyId: company.id,
            issueId: task.id,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    return summary;
  })();
  activeTaskOwnerBoundaryReconcile = operation;
  try {
    return await operation;
  } finally {
    if (activeTaskOwnerBoundaryReconcile === operation) activeTaskOwnerBoundaryReconcile = null;
  }
}
async function handleTaskOwnerReportReconcile(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const taskId = textParam(params, "issueId") || textParam(params, "taskId");
  if (!taskId) throw new Error("issueId is required.");
  const task = await ctx.issues.get(taskId, companyId);
  if (!task?.parentId) throw new Error("Task owner report reconciliation is available only on a child Task issue.");
  if (!TASK_OWNER_REPORT_STATUSES.has(task.status)) {
    const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
    const taskState = parseState(taskStateDocument?.body);
    const ownerRoom = await ctx.issues.get(task.parentId, companyId);
    if (taskState?.kind === "task_room" && ownerRoom && await cancelResolvedTaskOwnerQuotaRetry(ctx, {
      companyId,
      task,
      taskState,
      ownerRoom
    })) {
      return {
        ok: true,
        scheduled: false,
        code: "resolved_task_owner_retry_cancelled",
        message: "The resolved Task's obsolete owner report retry was cancelled and the Room was released.",
        taskStatus: task.status
      };
    }
    return {
      ok: false,
      scheduled: false,
      code: "task_not_at_report_boundary",
      message: "Only an in_review or blocked Task can reconcile its latest Worker report.",
      taskStatus: task.status
    };
  }
  const occurredAt = now();
  const result = await handleTaskStatusUpdated(ctx, {
    eventId: `manual-task-owner-report-reconcile:${task.id}:${occurredAt}`,
    eventType: "plugin.action",
    occurredAt,
    actorType: "user",
    actorId: textParam(asRecord3(actionCtx?.actor), "id") || null,
    companyId,
    entityId: task.id,
    entityType: "issue",
    payload: { status: task.status, _previous: { status: task.status } }
  });
  const { completion: _completion, ...outcome } = result;
  return {
    ok: result.scheduled === true || result.reason === "duplicate_worker_report",
    ...outcome
  };
}
function reconcileTaskOwnerNotificationStateForJob(taskState, job) {
  if (job?.kind !== "task_owner_report" || !job?.taskIssueId || ACTIVE_ROOM_JOB_STATUSES.has(job.status)) return false;
  const notification = asRecord3(taskState?.ownerNotification);
  if (textParam(notification, "jobId") !== job.id || textParam(notification, "status") !== "working") return false;
  const completed = job.status === "completed";
  taskState.ownerNotification = {
    ...notification,
    status: completed ? "completed" : "failed",
    resultCommentId: job.resultCommentId ?? notification.resultCommentId ?? null,
    ...completed ? {} : { error: textParam(job, "error") || `Task owner report Job ended with status ${job.status}.` },
    updatedAt: now()
  };
  return true;
}
async function reconcileTaskOwnerNotificationForJob(ctx, job) {
  if (job?.kind !== "task_owner_report" || !job?.taskIssueId || ACTIVE_ROOM_JOB_STATUSES.has(job.status)) return false;
  const document = await ctx.issues.documents.get(job.taskIssueId, TASK_ROOM_STATE_KEY, job.companyId);
  const taskState = parseState(document?.body);
  if (!taskState || taskState.kind !== "task_room" || !reconcileTaskOwnerNotificationStateForJob(taskState, job)) return false;
  await upsertRoomDocument(ctx, {
    issueId: job.taskIssueId,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId: job.companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: job.status === "completed" ? "Reconcile completed Task owner report Job" : "Release interrupted Task owner report for retry"
  });
  return true;
}
function isRetiredRoomJobError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message === "Room issue was not found." || message === "Closed Agent Rooms cannot receive chat messages." || message === "The Agent linked to this Room was not found.";
}
async function reconcileInterruptedRoomJobs(ctx) {
  const summary = { scanned: 0, reconciled: 0, retired: 0, failed: 0 };
  if (!ctx.entities?.list) return summary;
  const records = await ctx.entities.list({ entityType: ROOM_JOB_ENTITY_TYPE, limit: 500 });
  for (const record of records) {
    const job = roomJobData(asRecord3(record.data));
    if (!job.id || !job.companyId || !job.roomIssueId) continue;
    summary.scanned += 1;
    if (!ACTIVE_ROOM_JOB_STATUSES.has(job.status)) {
      await reconcileTaskOwnerNotificationForJob(ctx, job).catch((error) => {
        ctx.logger?.warn?.("Terminal Task owner report notification could not be reconciled.", {
          roomIssueId: job.roomIssueId,
          taskIssueId: job.taskIssueId,
          message: error instanceof Error ? error.message : String(error)
        });
      });
      continue;
    }
    if (activeRoomMessageJobs.has(job.roomIssueId)) continue;
    try {
      const { issue, agent } = await requireRoom(ctx, job.companyId, job.roomIssueId);
      const state = await loadRoomState(ctx, job.companyId, issue, agent);
      if (isRoomProviderQuotaRetryJob(job) && textParam(state.pendingTurn, "jobId") === job.id) {
        await launchDueRoomProviderQuotaRetry(ctx, job).catch(() => null);
        continue;
      }
      let patch = terminalRoomJobPatchFromState(job, state);
      if (!patch) {
        patch = {
          status: "interrupted",
          completedAt: now(),
          error: "The plugin worker restarted before this Job completed. The submitted message and Room state were preserved."
        };
      }
      const reconciled = await updateRoomJob(ctx, job, patch);
      if (textParam(state.pendingTurn, "jobId") === job.id) {
        state.pendingTurn = null;
        finishRoomActivity(state, "failed", reconciled.error);
        await saveRoomState(ctx, job.companyId, issue.id, state, "Mark interrupted Room Job during startup reconciliation");
      }
      await reconcileTaskOwnerNotificationForJob(ctx, reconciled);
      emitRoomEvent(ctx, job.companyId, issue.id, { type: reconciled.status, job: reconciled });
      summary.reconciled += 1;
    } catch (error) {
      if (isRetiredRoomJobError(error)) {
        const retired = await updateRoomJob(ctx, job, {
          status: "interrupted",
          completedAt: now(),
          error: "The Agent Room is no longer active. This interrupted Job was retired during reconciliation."
        });
        await reconcileTaskOwnerNotificationForJob(ctx, retired).catch(() => null);
        summary.retired += 1;
        continue;
      }
      summary.failed += 1;
      ctx.logger?.warn?.("Room Job could not be reconciled after worker restart.", {
        roomIssueId: job.roomIssueId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return summary;
}
var plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.data.register("room-chat-view", (params) => handleRoomView(ctx, params));
    ctx.data.register("room-task-summary", (params) => handleRoomTaskSummary(ctx, params));
    ctx.data.register("room-workspace-view", (params) => handleRoomWorkspaceView(ctx, params));
    ctx.data.register("task-room-view", (params) => handleTaskRoomView(ctx, params));
    ctx.data.register("project-workplane-view", (params) => handleProjectWorkplaneView(ctx, params));
    ctx.data.register("project-tasks-view", (params) => handleProjectTasksView(ctx, params));
    ctx.data.register("codex-accounts-view", (params) => handleCodexAccountsView(ctx, params));
    ctx.data.register("organization-settings-view", (params) => handleOrganizationSettingsView(ctx, params));
    ctx.actions.register("room-bootstrap", (params, actionCtx) => handleRoomBootstrap(ctx, params, actionCtx));
    ctx.actions.register("room-send", (params, actionCtx) => handleRoomSendJob(ctx, params, actionCtx));
    ctx.actions.register("room-compact", (params, actionCtx) => handleRoomCompactJob(ctx, params, actionCtx));
    ctx.actions.register("task-request-owner-feedback", (params, actionCtx) => handleTaskOwnerFeedbackJob(ctx, params, actionCtx));
    ctx.actions.register("task-reconcile-owner-report", (params, actionCtx) => handleTaskOwnerReportReconcile(ctx, params, actionCtx));
    ctx.actions.register("codex-account-select", (params, actionCtx) => handleCodexAccountSelect(ctx, params, actionCtx));
    ctx.actions.register("organization-agent-policy-save", (params, actionCtx) => handleOrganizationAgentPolicySave(ctx, params, actionCtx));
    ctx.actions.register("organization-settings-access", (params, actionCtx) => handleOrganizationSettingsAccess(ctx, params, actionCtx));
    ctx.actions.register("organization-collaboration-readiness", (params, actionCtx) => handleOrganizationCollaborationReadiness(ctx, params, actionCtx));
    ctx.actions.register("organization-template-apply", (params, actionCtx) => handleOrganizationTemplateApply(ctx, params, actionCtx));
    ctx.actions.register("workspace-profile-access", (params, actionCtx) => handleWorkspaceProfileAccess(ctx, params, actionCtx));
    ctx.actions.register("workspace-profile-save", (params, actionCtx) => handleWorkspaceProfileSave(ctx, params, actionCtx));
    ctx.actions.register("workspace-profile-create-workspace", (params, actionCtx) => handleWorkspaceProfileCreateWorkspace(ctx, params, actionCtx));
    ctx.jobs.register("workplane-reconcile", async (job) => {
      const roomSummary = await reconcileAllProjectAgentRooms(ctx);
      const roomMemorySummary = await reconcileRoomMemoryLifecycle(ctx);
      const interruptedRoomJobSummary = await reconcileInterruptedRoomJobs(ctx);
      const ownerSummary = await reconcileTaskOwnerReportBoundaries(ctx, { runId: `job:${job.runId}` });
      ctx.logger?.info?.("Workplane reconciliation completed.", {
        runId: job.runId,
        trigger: job.trigger,
        roomSummary,
        roomMemorySummary,
        interruptedRoomJobSummary,
        ownerSummary,
        quotaRetryPolicy: "manual_only"
      });
    });
    ctx.events.on("project.created", async (event) => {
      if (!event.companyId || !event.entityId) return;
      try {
        await provisionProjectAgentRooms(ctx, event.companyId, event.entityId);
      } catch (error) {
        ctx.logger.error("Default project Agent Room provisioning failed.", {
          projectId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("agent.created", async (event) => {
      if (!event.companyId) return;
      try {
        await provisionAllProjectAgentRooms(ctx, event.companyId);
      } catch (error) {
        ctx.logger.error("Agent Room provisioning for existing Projects failed.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("agent.updated", async (event) => {
      if (!event.companyId || !event.entityId) return;
      try {
        await provisionAllProjectAgentRooms(ctx, event.companyId);
        await syncAgentRoomTitles(ctx, event.companyId, event.entityId);
      } catch (error) {
        ctx.logger.error("Agent Room reconciliation failed after an Agent update.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("agent.deleted", async (event) => {
      if (!event.companyId) return;
      try {
        await provisionAllProjectAgentRooms(ctx, event.companyId);
      } catch (error) {
        ctx.logger.error("Agent Room reconciliation failed after an Agent deletion.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("issue.updated", async (event) => {
      try {
        await handleTaskStatusUpdated(ctx, event);
      } catch (error) {
        ctx.logger?.error?.("Task owner Room report scheduling failed.", {
          issueId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("issue.comment.created", async (event) => {
      try {
        await handleTaskStatusUpdated(ctx, event);
      } catch (error) {
        ctx.logger?.error?.("Worker Task report disposition failed.", {
          issueId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  },
  async shutdown() {
    for (const client of codexClients.values()) client.stop();
    codexClients.clear();
    testCodexClient = null;
    testAgyClientFactory = null;
    activeThreadContexts.clear();
    nativeCompactionLocks.clear();
    roomDocumentWriteLocks.clear();
    manualCodexCompactionThreads.clear();
    recordedNativeCompactionEvents.clear();
    processedTaskOwnerReportEvents.clear();
    activeTaskOwnerReports.clear();
    activeWorkerRuntimeRecoveries.clear();
    activeTaskOwnerBoundaryReconcile = null;
    activeProviderQuotaReconcile = null;
    activeRoomQuotaRetryReconcile = null;
    pluginCtx = null;
  }
});
function setActiveThreadContextForTest(threadId, context) {
  if (context) activeThreadContexts.set(threadId, context);
  else activeThreadContexts.delete(threadId);
}
function setCodexClientForTest(client) {
  testCodexClient = client;
}
function setAgyClientFactoryForTest(factory) {
  testAgyClientFactory = factory;
}
function setActiveRoomJobForTest(issueId, promise) {
  if (promise) activeRoomMessageJobs.set(issueId, promise);
  else activeRoomMessageJobs.delete(issueId);
}
var worker_default = plugin;
if (!ROOM_CHAT_TEST_MODE) runWorker(plugin, import.meta.url);
export {
  activeRoomProcessBlocksOwnerReport,
  agentInstructions,
  agentInstructionsFingerprint,
  agentRoomAgentId,
  agentRoomRuntime,
  agentSessionContextMatches,
  appendCheckpoint,
  appendNativeCompactionOutsideInvocation,
  applyCodexAccountToAdapterConfig,
  applyNativeSessionActivityEvent,
  attachmentIdsParam,
  buildAgyRoomPrompt,
  buildRoomOperatingBrief,
  cancelResolvedTaskOwnerQuotaRetry,
  cancelResolvedTaskWorkerQuotaRetry,
  chooseDefaultWorkspace,
  chooseTaskWorkspace,
  cleanupRoomAttachmentCache,
  codexAccountLabel,
  codexClientKey,
  collaborationReadinessFromConfig,
  configuredEnvironment,
  configuredEnvironmentValue,
  worker_default as default,
  defaultWorkspaceKindForAgent,
  enforceUtf8Text,
  ensureNativeRoomSession,
  excludeWorkspaceRoomAttachments,
  fetchRoomMemory,
  getCodexClient,
  getRuntimeConfig,
  handleCodexAccountSelect,
  handleCodexAccountsView,
  handleCodexServerRequest,
  handleOrganizationAgentPolicySave,
  handleOrganizationCollaborationReadiness,
  handleOrganizationSettingsAccess,
  handleOrganizationSettingsView,
  handleProjectTasksView,
  handleProjectWorkplaneView,
  handleRoomBootstrap,
  handleRoomCompact,
  handleRoomCompactJob,
  handleRoomSend,
  handleRoomSendJob,
  handleRoomTaskSummary,
  handleRoomView,
  handleRoomWorkspaceView,
  handleTaskOwnerFeedback,
  handleTaskOwnerFeedbackJob,
  handleTaskOwnerReportReconcile,
  handleTaskRoomView,
  handleTaskStatusUpdated,
  handleWorkspaceProfileAccess,
  handleWorkspaceProfileCreateWorkspace,
  handleWorkspaceProfileSave,
  isAgentRoom,
  isCodexImageAttachment,
  isLongLivedRoom,
  isProviderQuotaError,
  isProviderQuotaRun,
  isRoomProviderQuotaRetryJob,
  isRoomUserComment,
  isSubstantiveTaskBoundaryReport,
  isWorkerOnlyRoomAgent,
  listIssueAttachmentsDirect,
  listIssueRunsDirect,
  listRoomJobs,
  loadAgentInstructions,
  loadProjectWorkspaceProfile,
  loadRoomState,
  loadRoomWorkState,
  localCodexAccounts,
  mergeRoomAttachments,
  mergeRoomWorkState,
  mostRecentComments,
  nativeCompactionEventId,
  nativeSessionResultText,
  newRoomState,
  newRoomWorkState,
  nextProviderQuotaRetryAt,
  normalizeCodexHome,
  normalizeRoomWorkState,
  normalizeWorkspaceProfile,
  parseAgyFallbackEnvelope,
  parseState,
  prepareCodexRoomTurn,
  prepareNativeRoomTurn,
  profileWorkspace,
  proposeRoomMemory,
  providerQuotaRetryAtFromError,
  providerQuotaRetryState,
  provisionAllProjectAgentRooms,
  provisionProjectAgentRooms,
  queueProjectRoomProvision,
  queueRoomDocumentWrite,
  readCollaborationReadiness,
  reconcileAllProjectAgentRooms,
  reconcileInterruptedRoomJobs,
  reconcileProviderQuotaRetries,
  reconcileProviderQuotaTask,
  reconcileRoomMemoryLifecycle,
  reconcileRoomProviderQuotaRetries,
  reconcileTaskOwnerNotificationStateForJob,
  reconcileTaskOwnerReportBoundaries,
  recordNativeCodexCompaction,
  repairUtf8Mojibake,
  requireAgentConfigurationAction,
  resolveCodexHomeForAgent,
  resolveRoomAttachments,
  retryRoomDocumentWrite,
  roomAttachmentCommentBlock,
  roomAttachmentName,
  roomAttachmentWorkspaceRoot,
  roomHasActiveWork,
  roomRole,
  roomRuntimeDisabledResult,
  roomRuntimeWithRoomSafety,
  roomThreadIdForCodexRuntime,
  roomTools,
  roomTurnText,
  roomUserCommentBody,
  roomWorkplaneBoundary,
  runAgyRoomFallback,
  saveProjectWorkspaceProfile,
  saveRoomState,
  saveRoomStateOutsideInvocation,
  saveRoomWorkState,
  scheduleRoomProviderQuotaRetry,
  searchRoomMemory,
  serializeState,
  setActiveRoomJobForTest,
  setActiveThreadContextForTest,
  setAgyClientFactoryForTest,
  setCodexClientForTest,
  stageRoomAttachments,
  startNativeAgentSessionTurn,
  startRoomTurn,
  syncAgentRoomTitles,
  taskBoundaryReportKind,
  taskOwnerReportPrompt,
  taskOwnerRoomResultVisibilityOutsideInvocation,
  taskStatusTransition,
  updateAgentAdapterConfigDirect,
  updateRoomWorkStateOutsideInvocation,
  validateRoomRetrySource,
  workspaceGitChanges,
  workspaceGitExcludePath,
  workspaceKindForProjectWorkspace,
  workspaceLocalPath
};
