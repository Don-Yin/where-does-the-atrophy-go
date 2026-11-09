/** Focused Preview scenarios, registered against the same parameterized flow. */
import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {AtrophyLeafScenario} from "./AtrophyLeafScenario"

@component
export class AtrophyLeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "atrophy-01-startup", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "startup"}},
    {id: "atrophy-02-endpoints", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "endpoints"}},
    {id: "atrophy-03-smooth-morph", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "morph"}},
    {id: "atrophy-04-billboard-slices", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "slices"}},
    {id: "atrophy-05-readability", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "readability"}},
    {id: "atrophy-06-ik-far-field", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "far-field"}},
    {id: "atrophy-07-demo-sweep", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "demo-sweep"}},
    {id: "atrophy-08-clinicians", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "clinicians"}},
    {id: "atrophy-12-slice-focus", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "slice-focus"}},
    {id: "atrophy-13-inspect-copy", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "inspect"}},
    {id: "atrophy-14-projection-clearance", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "projection"}},
    {id: "atrophy-11-placement", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "placement"}},
    {id: "atrophy-10-warp-view", typename: AtrophyLeafScenario.getTypeName(), parameters: {criterion: "warp", weight: "0.5", capture_action: "check", capture_phase_seconds: "0", capture_tile: "-1", capture_transaction: ""}},
  ]
}
