export interface Variable {
    name: string,
    displayName?: string,
    question?: string,
    description?: string,
    possibleValues: PossibleValue[],
    type: VariableType
}

/** Возможное значение переменной */
export interface PossibleValue {
    name: string,
    displayName?: string,
    description?: string,
    value: number
}

/** Правило вывода */
export interface Rule {
    /** Посылки правила */
    reasons: Fact[],
    /** Вывод */
    result: Fact
}

/** Факт */
export interface Fact {
    variable: Variable,
    value: PossibleValue,
    type?: FactType
}

/** Тип факта */
export enum FactType {
    /** Выведен на основе правил */
    dedicated,
    /** Факт введён пользователем */
    entered
}

/** Тип переменной */
export enum VariableType {
    /** Выводимая */
    deductible,
    /** Запрашиваемая */
    queryable,
    /** И выводимая, и запрашиваемая одновременно */
    both
}

/** Экспертная система */
export default class ExpertSystem {
    private readonly variables: Variable[];
    private readonly rules: Rule[];

    /** Известные факты */
    private facts: Fact[] = [];

    /** Искомая переменная */
    private readonly target: Variable;

    public get targetValue() {
        return this.facts.find(x => x.variable === this.target)?.value;
    }

    /** Переменные, значения которых нужно запросить у пользователя */
    public variablesToQuery: Variable[] = [];

    /**
     * @param variables Список переменных
     * @param rules Список правил вывода
     * @param target Искомая переменная
     */
    constructor(variables: Variable[], rules: Rule[], target: Variable) {
        this.variables = variables;
        this.rules = rules;
        this.target = target;
    }

    /** Выполнить попытку применить правило */
    private tryApplyRule(rule: Rule): Fact | null {

        for (const reason of rule.reasons) {
            const existedFact = this.facts.find(x =>
                x.variable === reason.variable
                && x.value === reason.value);

            if(!existedFact) return null;
        }

        return rule.result;
    }

    public addFact(fact: Fact) {
        const newFacts = [fact] as Fact[];

        // Перевывод фактов
        for (const fact of newFacts) {
            this._deleteFact(fact.variable);
            replaceOrAdd(fact, this.facts, (x, y) => x.variable === y.variable);
            for (const rule of this.rules) {
                if (rule.reasons.some(x => x.value === fact.value)) {
                    const newFact = this.tryApplyRule(rule);
                    if (!newFact) continue;

                    const canBeAdded = this.facts.every(x =>
                        x.variable !== newFact.variable
                        || x.value === newFact.value
                        || x.type === FactType.entered)

                    if (!canBeAdded) continue;
                    if (newFacts.some(x => x.variable === newFact.variable))
                        continue;

                    newFacts.push(newFact)
                }
            }
        }

        this.updateVariablesToQuery();
    }

    public deleteFact(variable: Variable) {
        this._deleteFact(variable);
        this.updateVariablesToQuery();
    }
    private _deleteFact(variable: Variable, value?: PossibleValue, onlyDeducted: boolean = false) {
        let fact = this.facts.find(x => x.variable === variable && (!value || x.value === value));
        if (!fact) return;
        if (fact.type === FactType.entered && onlyDeducted) return;

        const i = this.facts.indexOf(fact);
        this.facts.splice(i, 1);

        const rules = this.rules
            .filter(x => x.reasons.find(y => y.variable === fact!.variable && y.value === fact!.value));

        for (const rule of rules) {
            this._deleteFact(rule.result.variable, rule.result.value, true);
        }
    }

    public updateVariablesToQuery(variable?: Variable, value?: PossibleValue): Variable[] | null {
        if(!variable) {
            this.variablesToQuery = [];
            const variables = this.updateVariablesToQuery(this.target);
            if(!variables) return null;
            for (const variable of variables) {
                pushIfNotExist(variable, this.variablesToQuery);
            }
            return [];
        }

        /** Уже известный факт */
        const fact = this.facts.find(x => x.variable === variable);
        console.log({fact, variable, value, b: !fact || !value || fact.value === value});
        if(fact) return !value || fact.value === value ? [] : null;

        if(variable.type === VariableType.queryable) {
            return [variable];
        }

        /** Правила, по которым выводится переменная */
        let rules = this.rules.filter(x => x.result.variable === variable);
        if (value) rules = rules.filter(x => x.result.value === value);

        if(rules.length === 0) return variable.type === VariableType.both ? [variable] : null;

        let variables = [] as Variable[];
        for (const rule of rules) {
            let variablesByRule = [] as Variable[];
            for (const reason of rule.reasons) {
                const toQuery = this.updateVariablesToQuery(reason.variable, reason.value);
                if(!toQuery) {
                    variablesByRule = [];
                    break;
                }
                variablesByRule = variablesByRule.concat(toQuery);
            }
            variables = variables.concat(variablesByRule);
        }
        return variables.length > 0 ? variables :  null;
    }
}

/** Добавить элемент в массив, если такого элемента ещё нет
 *
 * @param value Добавляемый элемент
 * @param array Массив, в который будет произведено добавление
 * @param comparer Функция сравнения двух элементов
 */
function pushIfNotExist<T>(
    value:T,
    array: T[],
    comparer: (x: T, y: T) => boolean = (x, y) => x === y
) {
    const existed = array.find(x => comparer(x, value));
    if(typeof existed === 'undefined') array.push(value)
}

/** Добавить элемент в массив или заменить существующий.
 *
 * @param value Добавляемый элемент
 * @param array Массив, в который будет произведено добавление
 * @param comparer Функция сравнения двух элементов
 */
function replaceOrAdd<T>(
    value:T,
    array: T[],
    comparer: (x: T, y: T) => boolean = (x, y) => x === y
) {
    const existed = array.findIndex(x => comparer(x, value));
    if(existed === -1) array.push(value)
    else array.splice(existed, 1, value);
}

export async function loadAndParseConfig(path: string): Promise<{
    variables: Variable[],
    rules: Rule[],
    target: Variable
}> {
    interface FactDto {
        variableName: string,
        valueName: string
    }

    function restoreFact(factDto:FactDto, variables: Variable[]): Fact {
        const fact = {} as any;
        fact.variable = variables.find((x:any) => x.name === factDto.variableName);

        fact.value = fact.variable.possibleValues
            .find((x:PossibleValue) => x.name === factDto.valueName);

        return fact;
    }

    const response = await fetch(path);
    const responseBody = await response.json() as {
        variables: Variable[],
        rules: {
            reasons: FactDto[],
            result: FactDto
        }[],
        targetName: string
    };

    const variables = responseBody.variables;
    const rules = responseBody.rules;
    const targetName = responseBody.targetName;

    for (const rule of rules as any) {
        rule.reasons = rule.reasons.map((x:FactDto) => restoreFact(x, variables)) as Fact[];
        rule.result = restoreFact(rule.result, variables);
    }
    const target = variables.find(x => x.name === targetName)!;

    return {
        variables,
        rules: (rules as any[]) as Rule[],
        target
    }
}