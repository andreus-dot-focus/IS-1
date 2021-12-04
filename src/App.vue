<template>
  <div class="container is-max-desktop is-flex is-align-items-center is-flex-direction-column h-100vh" style="width:30em">
      <div class="mt-6 mb-6 has-background-white-ter w-100 p-3">
          <b-field v-if="systemInitialized" v-for="(fieldSetItem, i) of fieldSet" :key="fieldSetItem.variable.name" :label="fieldSetItem.variable.question" label-position="on-border">
              <b-select :value="(fieldSetItem.value || {name: null}).name" expanded @input="onVariableValueChanged(fieldSetItem.variable, $event)">
                  <option v-for="possibleValue of ([{displayName: '--', name: null}].concat(fieldSetItem.variable.possibleValues))"
                          :value="possibleValue.name">
                      {{ possibleValue.displayName }}
                  </option>
              </b-select>
          </b-field>
          <b-message v-if="systemInitialized && system.targetValue" type="is-success">
              {{target.displayName}}: <b>{{system.targetValue.displayName}}</b>
          </b-message>
      </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ExpertSystem, {Fact, FactType, loadAndParseConfig, PossibleValue, Variable} from "@/ExpertSystem";

type FieldSet = (Fact & {value?: PossibleValue})[];

@Component
export default class App extends Vue {
    private variables: Variable[] = [];
    private enteredFacts: Fact[] = [];
    private target: Variable|null = null;
    private systemInitialized = false;

    private system: ExpertSystem|null = null;

    private get fieldSet(): FieldSet {
        if(!this.systemInitialized) return [];
        const fieldSet = this.enteredFacts as FieldSet;
        return fieldSet.concat(this.system!.variablesToQuery.map(x=>({variable: x})) as FieldSet)
            .sort((a, b) => a.variable.name.localeCompare(b.variable.name));
    }

    private onVariableValueChanged(variable: Variable, valueName: string|null) {
        if(!valueName) {
            this.system!.deleteFact(variable);
            const index = this.enteredFacts.findIndex(x => x.variable === variable);
            this.enteredFacts.splice(index, 1);
            return;
        }

        const newFact = {
            variable,
            value: variable.possibleValues.find(x => x.name === valueName)!,
            type: FactType.entered
        };

        const factIndex = this.enteredFacts.findIndex(x => x.variable === variable);
        if(factIndex !== -1) this.enteredFacts[factIndex] = newFact;
        else this.enteredFacts.push(newFact);

        this.system!.addFact(newFact);
    }

    async created() {
        const config = await loadAndParseConfig("/expert_configs/auto.json");
        this.variables = config.variables;
        this.target = config.target;

        this.system = new ExpertSystem(
            config.variables,
            config.rules,
            config.target
        );

        this.system.updateVariablesToQuery();
        this.systemInitialized = true;
    }
}
</script>

<style lang="scss">
.h-100vh {
    height: 100vh;
}

.w-100 {
    width: 100%;
}
</style>
