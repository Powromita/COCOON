"""
cocoon_contracts - Authoritative data contracts, validation rules, and schemas for COCOON.
"""

from cocoon_contracts.common import (
    AwareDatetime,
    ContractModel,
    Provenance,
    Schedule,
    SchedulePoint,
    SourceMetadata,
    ValidationIssue,
    ValidationReport,
    Vector3D,
    SCHEMA_VERSION,
)
from cocoon_contracts.errors import (
    ErrorCode,
    ErrorDetail,
    ErrorEnvelope,
)
from cocoon_contracts.requirements import (
    DesignConstraints,
    MissionRequirements,
    ProjectMode,
    RequirementsContract,
    SiteSpecification,
)
from cocoon_contracts.project import (
    Project,
)
from cocoon_contracts.materials import (
    MaterialRecord,
    MaterialSnapshot,
    MaterialThermalProperties,
)
from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    BuildingMetadata,
    BuildingModel,
    BuildingSource,
    ConstructionAssembly,
    Floor,
    Opening,
    OpeningType,
    Surface,
    SurfaceBoundaryType,
    SurfaceType,
    Zone,
    ZoneConnection,
    ZoneConnectionType,
    ZoneSize,
)
from cocoon_contracts.weather import (
    GapInterpolationRecord,
    HourlyWeatherPoint,
    WeatherSnapshot,
    WeatherSourceMetadata,
)
from cocoon_contracts.simulation import (
    EngineMetadata,
    RecommendationState,
    SimulationEngineMode,
    SimulationOutputEngineMode,
    SimulationProvenance,
    SimulationRequest,
    SimulationRequestEngineMetadata,
    SimulationResult,
    SimulationStatus,
    SimulationSummary,
    TimeSeriesPoint,
    ZoneSummary,
)
from cocoon_contracts.economics import (
    AnnualOpexPoint,
    CapexBreakdown,
    CostScenario,
    EconomicAnalysisResult,
    EconomicAssumptionSet,
)
from cocoon_contracts.ansys import (
    AnsysArtifactManifest,
    AnsysComparisonMetrics,
    AnsysJobRequest,
    AnsysJobStatus,
    AnsysSolverConfig,
    AnsysValidationResult,
)
from cocoon_contracts.visualization import (
    ContourArtifactRef,
    MeshBox,
    OpeningVisual,
    SurfaceVisual,
    VisualizationModel,
    VisualizationSource,
    ZoneTemperatureSeries,
)

__version__ = "4.0.0"

__all__ = [
    # Version
    "SCHEMA_VERSION",
    "__version__",
    # Common
    "AwareDatetime",
    "ContractModel",
    "Provenance",
    "Schedule",
    "SchedulePoint",
    "SourceMetadata",
    "ValidationIssue",
    "ValidationReport",
    "Vector3D",
    # Errors
    "ErrorCode",
    "ErrorDetail",
    "ErrorEnvelope",
    # Requirements & Project
    "DesignConstraints",
    "MissionRequirements",
    "ProjectMode",
    "RequirementsContract",
    "SiteSpecification",
    "Project",
    # Materials
    "MaterialRecord",
    "MaterialSnapshot",
    "MaterialThermalProperties",
    # Building
    "AssemblyCategory",
    "AssemblyLayer",
    "BuildingMetadata",
    "BuildingModel",
    "BuildingSource",
    "ConstructionAssembly",
    "Floor",
    "Opening",
    "OpeningType",
    "Surface",
    "SurfaceBoundaryType",
    "SurfaceType",
    "Zone",
    "ZoneConnection",
    "ZoneConnectionType",
    "ZoneSize",
    # Weather
    "GapInterpolationRecord",
    "HourlyWeatherPoint",
    "WeatherSnapshot",
    "WeatherSourceMetadata",
    # Simulation
    "EngineMetadata",
    "RecommendationState",
    "SimulationEngineMode",
    "SimulationOutputEngineMode",
    "SimulationProvenance",
    "SimulationRequest",
    "SimulationRequestEngineMetadata",
    "SimulationResult",
    "SimulationStatus",
    "SimulationSummary",
    "TimeSeriesPoint",
    "ZoneSummary",
    # Economics
    "AnnualOpexPoint",
    "CapexBreakdown",
    "CostScenario",
    "EconomicAnalysisResult",
    "EconomicAssumptionSet",
    # ANSYS
    "AnsysArtifactManifest",
    "AnsysComparisonMetrics",
    "AnsysJobRequest",
    "AnsysJobStatus",
    "AnsysSolverConfig",
    "AnsysValidationResult",
    # Visualization
    "ContourArtifactRef",
    "MeshBox",
    "OpeningVisual",
    "SurfaceVisual",
    "VisualizationModel",
    "VisualizationSource",
    "ZoneTemperatureSeries",
]
